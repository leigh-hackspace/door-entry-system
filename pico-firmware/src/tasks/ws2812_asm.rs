use core::arch::asm;
use embassy_rp::{
    Peri,
    gpio::{Level, Output},
    peripherals::PIN_9,
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::Timer;

#[derive(PartialEq, Debug)]
pub enum Ws2812Message {
    Flash(u64, u32, u8, u8, u8),
}

pub type Ws2812Signal = Signal<CriticalSectionRawMutex, Ws2812Message>;

const NUM_LEDS: usize = 8;

#[embassy_executor::task]
pub async fn ws2812_asm_task(signal: &'static Ws2812Signal, din: Peri<'static, PIN_9>) {
    let mut output = Output::new(din, Level::Low);

    loop {
        match signal.wait().await {
            Ws2812Message::Flash(ms, times, red, green, blue) => {
                // output.set_low();
                // Timer::after_millis(10).await;
                // output.set_high();

                for _ in 0..times {
                    send_solid_colour(red, green, blue);

                    Timer::after_millis(ms as u64).await;

                    send_solid_colour(0, 0, 0);

                    Timer::after_millis(ms as u64).await;
                }
            }
        }
    }
}

fn send_ws2812b_byte(byte: u8, sio_set: usize, sio_clr: usize, pin_bit: u32) {
    unsafe {
        asm!(
            // Send 8 bits, starting from MSB (bit 7)
            "mov {bit_count}, #8",

            "10:",  // bit_loop
            // Test the current bit (MSB first)
            "tst {data}, {bit_mask}",
            "bne 11f",  // send_one

            // send_zero:
            // T0H: Set pin high for ~60 cycles (0.4µs)
            "str {pin_bit}, [{sio_set}]",

            // Delay for T0H (~60 cycles)
            "mov {temp}, #18",        // ~18 * 3 + overhead ≈ 60 cycles
            "1:",
            "subs {temp}, {temp}, #1",
            "bne 1b",

            // T0L: Set pin low for ~127 cycles (0.85µs)
            "str {pin_bit}, [{sio_clr}]",

            // Delay for T0L (~127 cycles)
            "mov {temp}, #40",        // ~40 * 3 + overhead ≈ 127 cycles
            "2:",
            "subs {temp}, {temp}, #1",
            "bne 2b",

            "b 12f",  // next_bit

            "11:",  // send_one
            // T1H: Set pin high for ~120 cycles (0.8µs)
            "str {pin_bit}, [{sio_set}]",

            // Delay for T1H (~120 cycles)
            "mov {temp}, #38",        // ~38 * 3 + overhead ≈ 120 cycles
            "3:",
            "subs {temp}, {temp}, #1",
            "bne 3b",

            // T1L: Set pin low for ~67 cycles (0.45µs)
            "str {pin_bit}, [{sio_clr}]",

            // Delay for T1L (~67 cycles)
            "mov {temp}, #20",        // ~20 * 3 + overhead ≈ 67 cycles
            "4:",
            "subs {temp}, {temp}, #1",
            "bne 4b",

            "12:",  // next_bit
            // Shift to next bit
            "lsl {data}, {data}, #1",
            "subs {bit_count}, {bit_count}, #1",
            "bne 10b",  // bit_loop

            data = inout(reg) byte => _,
            bit_mask = in(reg) 0x80u8,
            bit_count = out(reg) _,
            temp = out(reg) _,
            sio_set = in(reg) sio_set,
            sio_clr = in(reg) sio_clr,
            pin_bit = in(reg) pin_bit,
            options(nostack)
        );
    }
}

// Function to send RGB data to WS2812B
fn send_ws2812b_rgb(r: u8, g: u8, b: u8, sio_set: usize, sio_clr: usize, pin_bit: u32) {
    // WS2812B expects GRB order
    send_ws2812b_byte(g, sio_set, sio_clr, pin_bit);
    send_ws2812b_byte(r, sio_set, sio_clr, pin_bit);
    send_ws2812b_byte(b, sio_set, sio_clr, pin_bit);
}

// Function to send an array of RGB values
fn send_ws2812b_strip(colors: &[(u8, u8, u8)], sio_set: usize, sio_clr: usize, pin_bit: u32) {
    // Disable interrupts to ensure precise timing
    cortex_m::interrupt::free(|_| {
        // Adding this seems to fix the signal for the first LED
        send_ws2812b_rgb(0, 0, 0, sio_clr, sio_clr, pin_bit);

        for &(r, g, b) in colors {
            send_ws2812b_rgb(r, g, b, sio_set, sio_clr, pin_bit);
        }

        // Send reset signal (low for >50µs)
        unsafe {
            (sio_clr as *mut u32).write_volatile(pin_bit);
            // Delay for reset (>50µs = >7500 cycles at 150MHz)
            for _ in 0..8000 {
                core::hint::spin_loop();
            }
        }
    });
}

fn send_solid_colour(r: u8, g: u8, b: u8) {
    let bank = 0;
    let pin = 9;
    let sio = 0xd000_0000usize;
    let sio_out = sio + 0x10usize + bank * 4usize;
    let sio_set = sio_out + 0x08usize;
    let sio_clr = sio_out + 0x10usize;
    let pin_bit = 1 << pin;

    // Configure pin as output (you'll need to do this first)
    // ... GPIO configuration code ...

    // Example: Send red, green, blue to 3 LEDs
    let colors = [(r, g, b); 8];

    send_ws2812b_strip(&colors, sio_set, sio_clr, pin_bit);
}

// Alternative: More precise timing using cycle counting
fn send_ws2812b_byte_precise(byte: u8, sio_set: usize, sio_clr: usize, pin_bit: u32) {
    unsafe {
        asm!(
            "mov {bit_count}, #8",

            "20:",  // bit_loop_precise
            "tst {data}, {bit_mask}",
            "bne 21f",  // send_one_precise

            // send_zero_precise:
            // T0H: exactly 60 cycles
            "str {pin_bit}, [{sio_set}]",  // 2 cycles
            "nop", "nop", "nop", "nop", "nop", "nop", "nop", "nop",  // 8 cycles
            "nop", "nop", "nop", "nop", "nop", "nop", "nop", "nop",  // 8 cycles
            "nop", "nop", "nop", "nop", "nop", "nop", "nop", "nop",  // 8 cycles
            "nop", "nop", "nop", "nop", "nop", "nop", "nop", "nop",  // 8 cycles
            "nop", "nop", "nop", "nop", "nop", "nop", "nop", "nop",  // 8 cycles
            "nop", "nop", "nop", "nop", "nop", "nop", "nop", "nop",  // 8 cycles
            "nop", "nop", "nop", "nop", "nop", "nop", "nop", "nop",  // 8 cycles
            "nop", "nop",  // 2 cycles (total: 60 cycles)

            // T0L: exactly 127 cycles
            "str {pin_bit}, [{sio_clr}]",  // 2 cycles
            ".rept 125",
            "nop",
            ".endr",  // 125 cycles (total: 127 cycles)

            "b 22f",  // next_bit_precise

            "21:",  // send_one_precise
            // T1H: exactly 120 cycles
            "str {pin_bit}, [{sio_set}]",  // 2 cycles
            ".rept 118",
            "nop",
            ".endr",  // 118 cycles (total: 120 cycles)

            // T1L: exactly 67 cycles
            "str {pin_bit}, [{sio_clr}]",  // 2 cycles
            ".rept 65",
            "nop",
            ".endr",  // 65 cycles (total: 67 cycles)

            "22:",  // next_bit_precise
            "lsl {data}, {data}, #1",      // 1 cycle
            "subs {bit_count}, {bit_count}, #1",  // 1 cycle
            "bne 20b",        // bit_loop_precise (2 cycles when taken)

            data = inout(reg) byte => _,
            bit_mask = in(reg) 0x80u8,
            bit_count = out(reg) _,
            sio_set = in(reg) sio_set,
            sio_clr = in(reg) sio_clr,
            pin_bit = in(reg) pin_bit,
            options(nostack)
        );
    }
}
