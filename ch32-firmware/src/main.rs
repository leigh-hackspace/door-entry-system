#![no_std]
#![no_main]
#![allow(static_mut_refs)]

mod utils;

use crate::utils::{
    button::{ButtonHandler, InterruptMessage},
    common::{parse_bool, parse_hex_color_u32, print_unsigned},
    rfid::{get_number, MySpiDevice},
    ws2812::{self, MAX_LED_COUNT, WS2812},
};
use ch32_hal::{
    bind_interrupts,
    gpio::{Input, Level, Output, Pull},
    pac::pfic::regs::Cfgr,
    spi::Spi,
    time::Hertz,
    usart::Uart,
};
use core::{arch::asm, cell::Cell};
use mfrc522::{comm::blocking::spi::SpiInterface, Mfrc522};
use panic_halt as _;
use qingke::{interrupt::Priority, riscv};
use qingke_rt::CoreInterrupt;

const MAGIC_TAG: u128 = 2741061529u128;

enum Command {
    NoAction,
    Unknown,
    Reset,
    Ping,
    Led(usize, [u32; MAX_LED_COUNT]),
    Lock(bool),
}

// Simple global variables - no atomics needed with single core
static mut SYSTICK_MILLIS: u32 = 0;
static mut LAST_SEEN_MILLIS: u32 = 0;

// Button handler instance
static mut BUTTON_HANDLER: ButtonHandler = ButtonHandler::new(50, 1000); // 50ms debounce, 1000ms long press

// SysTick interrupt
static mut BUTTON: Option<Input<'static>> = None;
static mut MESSAGE: Cell<InterruptMessage> = Cell::new(InterruptMessage::None);

// USART interrupt
static mut BUFFER: [u8; 128] = [0u8; 128];
static mut BUFFER_POS: usize = 0;
static mut LINE_READY: bool = false;

#[qingke_rt::interrupt]
fn USART1() {
    // USART1 = 0x4001_3800
    // STATR OFFSET = 0x0
    // RXNE BIT 5
    &ch32_hal::pac::USART1.statr().modify(|w| w.set_rxne(false));

    unsafe {
        if LINE_READY {
            return;
        }

        // DATAR OFFSET = 0x4
        let byte = (ch32_hal::pac::USART1.datar().read().dr() & 0xff) as u8;

        BUFFER[BUFFER_POS] = byte;
        BUFFER_POS += 1;

        if BUFFER_POS >= BUFFER.len() || byte == b'\r' || byte == b'\n' {
            LINE_READY = true;
        }
    }
}

// Helper function to read available data from ring buffer
fn read_available() -> Option<&'static [u8]> {
    unsafe {
        if LINE_READY {
            return Some(&BUFFER[0..BUFFER_POS]);
        }
    }

    None
}

fn read_done() {
    unsafe {
        BUFFER_POS = 0;
        LINE_READY = false;
    }
}

#[qingke_rt::interrupt(core)]
fn SysTick() {
    let r = &ch32_hal::pac::SYSTICK;

    // Clear interrupt flag
    r.sr().write(|w| w.set_cntif(false));

    // Increment milliseconds counter
    unsafe {
        SYSTICK_MILLIS = SYSTICK_MILLIS.wrapping_add(1);

        // Watchdog
        if SYSTICK_MILLIS - LAST_SEEN_MILLIS > 5000 {
            qingke::riscv::asm::delay(1000000);
            // Software reset
            ch32_hal::pac::PFIC.cfgr().write_value(Cfgr(0xbeef0000 | (1 << 7)));
        }

        // Handle button input
        if let Some(ref mut button) = BUTTON {
            let message = BUTTON_HANDLER.update(button.is_low(), SYSTICK_MILLIS);

            if message != InterruptMessage::None {
                set_message(message);
            }
        }
    }
}

unsafe fn set_message(msg: InterruptMessage) {
    MESSAGE.set(msg);
}

fn get_and_clear_message() -> InterruptMessage {
    unsafe { MESSAGE.replace(InterruptMessage::None) }
}

fn systick_init() {
    let r = &ch32_hal::pac::SYSTICK;

    // Calculate counts per millisecond using HCLK/8 as clock source
    // HCLK/8 = 48MHz/8 = 6MHz
    // For 1ms interrupt: 6MHz / 1000 = 6000 counts
    let cnt_per_ms = 48_000_000 / 8 / 1000;

    // Set compare register and reset counter
    r.cmp().write_value(cnt_per_ms - 1);
    r.cnt().write_value(0);

    // Clear interrupt flag
    r.sr().write(|w| w.set_cntif(false));

    // Configure and start SysTick
    r.ctlr().write(|w| {
        w.set_ste(true); // Enable counter
        w.set_stie(true); // Enable interrupt
        w.set_stre(true); // Auto reload enable
        w.set_stclk(ch32_hal::pac::systick::vals::Stclk::HCLK_DIV8); // HCLK/8 clock source
    });
}

// Simple utility function to get milliseconds
fn millis() -> u32 {
    unsafe { SYSTICK_MILLIS }
}

#[qingke_rt::entry]
fn main() -> ! {
    riscv::asm::delay(5_000_000);

    let mut config = ch32_hal::Config::default();
    config.rcc = ch32_hal::rcc::Config::SYSCLK_FREQ_48MHZ_HSI;
    let p = ch32_hal::init(config);

    // UART
    let rx_pin = p.PD6;
    let tx_pin = p.PD5;

    // SPI1, remap 0
    let cs_pin = p.PD0;
    let sck = p.PC5;
    let mosi = p.PC6;
    let miso = p.PC7;

    // LED strip
    let ws2812_pin = p.PD4;

    let (mut tx, mut rx) = Uart::new_blocking(p.USART1, rx_pin, tx_pin, Default::default()).unwrap().split();

    tx.blocking_write(b"INIT\r\n").unwrap();

    let mut lock = Output::new(p.PC1, Level::High, Default::default());
    let button = Input::new(p.PC2, Pull::Up);
    let mut ws2812_output = Output::new(ws2812_pin, Level::Low, Default::default());

    // Initialize SysTick for 1ms interrupts
    systick_init();

    // Enable SysTick interrupt
    unsafe {
        // Store LED in global variable
        BUTTON = Some(button);

        qingke::pfic::set_priority(CoreInterrupt::SysTick as u8, Priority::P15 as u8);
        qingke::pfic::enable_interrupt(CoreInterrupt::SysTick as u8);
    }

    let mut cs = Output::new(cs_pin, Level::Low, Default::default());

    let mut spi_config = ch32_hal::spi::Config::default();
    spi_config.frequency = Hertz::khz(100);

    // Remap 0
    let spi = Spi::new_blocking::<0>(p.SPI1, sck, mosi, miso, spi_config);

    let device = MySpiDevice { spi, cs };

    let itf = SpiInterface::new(device);

    let mut mfrc522 = Mfrc522::new(itf).init().unwrap();

    match mfrc522.version() {
        Ok(version) => {
            tx.blocking_write(b"MFRC VERSION ").unwrap();
            print_unsigned(&mut tx, version as u128);
            tx.blocking_write(b"\r\n").unwrap();
        }
        Err(_e) => {}
    }

    let mut ws2812_service = WS2812::new();

    ws2812_service.reset();

    for _ in 0..5 {
        ws2812_service.set_all_leds(8, 0x333333);
        qingke::riscv::asm::delay(2000000);

        ws2812_service.set_all_leds(8, 0x000000);
        qingke::riscv::asm::delay(2000000);
    }

    // Turn on the USART interrupt
    ch32_hal::pac::USART1.ctlr1().modify(|w| w.set_rxneie(true));

    let mut command = Command::NoAction;

    let mut last_card_millis: u32 = 0;

    loop {
        if let Some(buffer) = read_available() {
            // Ensure we have more than just the line break
            if let Some(command_str) = core::str::from_utf8(&buffer).ok() {
                // tx.blocking_write(b"\r\n").unwrap();

                // // Echo the command so we can check it has been received correctly
                // tx.blocking_write(command_str.as_bytes()).unwrap();
                // tx.blocking_write(b"\r\n").unwrap();

                command = parse_command(command_str.trim());
            }

            read_done();
        }

        // Don't spam the serial bus
        if millis() - last_card_millis > 1000 {
            // NOTE: Large number of milliseconds needed for the card reader
            if let Ok(mut atqa) = mfrc522.new_card_present() {
                if let Ok(uid) = mfrc522.select(&mut atqa) {
                    let code = get_number(uid.as_bytes());

                    last_card_millis = millis();

                    // Quick flash to indicate a card has been read
                    ws2812_service.set_all_leds(8, 0x770000);
                    qingke::riscv::asm::delay(1000000);
                    ws2812_service.set_all_leds(8, 0x000000);

                    if code == MAGIC_TAG {
                        command = Command::Lock(false);
                        ws2812_service.set_all_leds(8, 0x770000);
                    } else {
                        tx.blocking_write(b"CODE ").unwrap();
                        print_unsigned(&mut tx, code);
                        tx.blocking_write(b"\r\n").unwrap();
                    }
                }
            }
        }

        unsafe {
            // If the `mfrc522` blocks we won't reach this line and the watchdog will reboot...
            LAST_SEEN_MILLIS = millis();
        }

        match command {
            Command::NoAction => {}
            Command::Unknown => {
                tx.blocking_write(b"UNKNOWN\r\n").unwrap();
            }
            Command::Reset => {
                ch32_hal::pac::PFIC.cfgr().write_value(Cfgr(0xbeef0000 | (1 << 7)));
                qingke::riscv::asm::delay(10000000);
            }
            Command::Ping => {
                tx.blocking_write(b"PONG ").unwrap();
                print_unsigned(&mut tx, millis() as u128);
                tx.blocking_write(b"\r\n").unwrap();
            }
            Command::Led(count, buf) => {
                ws2812_service.set_leds(count as u8, &buf[..count]);
                tx.blocking_write(b"LED APPLIED\r\n").unwrap();
            }
            Command::Lock(state) => {
                if state {
                    lock.set_level(Level::High);
                    tx.blocking_write(b"LOCKED\r\n").unwrap();
                } else {
                    lock.set_level(Level::Low);
                    tx.blocking_write(b"UNLOCKED\r\n").unwrap();
                }
            }
        }

        command = Command::NoAction;

        match get_and_clear_message() {
            InterruptMessage::None => {}
            InterruptMessage::ShortPress => {
                ws2812_service.set_all_leds(8, 0x007700);
                qingke::riscv::asm::delay(1000000);
                ws2812_service.set_all_leds(8, 0x000000);

                tx.blocking_write(b"SHORT PRESS\r\n").unwrap();
            }
            InterruptMessage::LongPress => {
                ws2812_service.set_all_leds(8, 0x000077);
                qingke::riscv::asm::delay(2000000);
                ws2812_service.set_all_leds(8, 0x000000);

                tx.blocking_write(b"LONG PRESS\r\n").unwrap();
            }
        }
    }
}

fn parse_command(command: &str) -> Command {
    let mut parts = command.split_whitespace();

    match parts.next() {
        Some("RESET") => Command::Reset,
        Some("PING") => Command::Ping,
        Some("LED") => {
            let mut buffer = [0u32; MAX_LED_COUNT];
            let mut led_count = 0usize;

            loop {
                match parts.next() {
                    Some(led_hex_str) => {
                        if led_count >= MAX_LED_COUNT {
                            break; // Prevent buffer overflow
                        }

                        // Convert "FF7700" to 24-bit u32 value
                        if let Ok(color_u32) = parse_hex_color_u32(led_hex_str) {
                            buffer[led_count] = color_u32;
                            led_count += 1;
                        }
                    }
                    None => {
                        break;
                    }
                }
            }

            Command::Led(led_count, buffer)
        }
        Some("LOCK") => {
            if let Some(lock_str) = parts.next() {
                if let Ok(lock) = parse_bool(lock_str) {
                    return Command::Lock(lock);
                }
            }

            Command::NoAction
        }
        _ => Command::Unknown,
    }
}
