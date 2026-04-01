//! This example implements a TCP client that attempts to connect to a host on port 1234 and send it some data once per second.
//!
//! Example written for the [`WIZnet W6100-EVB-Pico2`](https://docs.wiznet.io/Product/iEthernet/W6100/W6100-evb-pico2) board.

#![no_std]
#![no_main]
#![feature(future_join)]

extern crate alloc;

#[path = "../services/mod.rs"]
mod services;
#[path = "../tasks/mod.rs"]
mod tasks;
#[path = "../utils/mod.rs"]
mod utils;

use crate::{
    services::{auth::check_code, common::DeviceState, state::PermanentStateService},
    tasks::{
        audio::{AudioCommand, AudioCommandSignal, audio_task},
        button::{ButtonSignal, ButtonSignalMessage, button_task},
        door::{DoorSignal, DoorSignalMessage, door_task},
        file::{FileCommand, FileCommandChannel, FileMessage, FileMessageChannel, file_task},
        rfid::{RfidSignal, RfidSignalMessage, rfid_task},
        websocket::{WebSocketIncoming, WebSocketIncomingChannel, WebSocketOutgoing, WebSocketOutgoingChannel, websocket_task},
    },
    utils::{
        common::{BIT_DEPTH, Flash, SAMPLE_RATE, SharedFs},
        local_fs::LocalFs,
    },
};
use alloc::{borrow::ToOwned, boxed::Box, format, string::ToString, sync::Arc};
use core::{
    cell::UnsafeCell,
    sync::atomic::{AtomicU32, Ordering},
};
use cyw43_pio::{PioSpi, RM2_CLOCK_DIVIDER};
use defmt::*;
use embassy_executor::Spawner;
use embassy_futures::{
    select::{Either, Either3, Either4, select, select3, select4},
    yield_now,
};
use embassy_rp::{
    Peri, bind_interrupts, dma,
    flash::ERASE_SIZE,
    gpio::{Level, Output},
    peripherals::{DMA_CH2, DMA_CH3, DMA_CH4, DMA_CH5, DMA_CH6, PIN_2, PIN_3, PIN_4, PIN_5, PIN_6, PIN_7, PIN_8, PIO0, PIO1, PIO2},
    pio::{self, Irq, Pio},
    watchdog::Watchdog,
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, channel::Channel, rwlock::RwLock, signal::Signal};
use embassy_time::{Duration, Instant, Timer};
use embedded_alloc::LlffHeap as Heap;
use fatfs::{File, LossyOemCpConverter, NullTimeProvider, Write};
use {defmt_rtt as _, panic_probe as _};

#[cfg(feature = "wired")]
use crate::tasks::ws2812::{Ws2812Message, Ws2812Signal, ws2812_task};
#[cfg(feature = "wifi")]
use crate::tasks::ws2812_asm::{Ws2812Message, Ws2812Signal, ws2812_asm_task};

#[global_allocator]
static HEAP: Heap = Heap::empty();

const DEVICE_NAME: &str = env!("DEVICE_NAME");

bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => embassy_rp::pio::InterruptHandler<embassy_rp::peripherals::PIO0>;
    PIO1_IRQ_0 => embassy_rp::pio::InterruptHandler<embassy_rp::peripherals::PIO1>;
    PIO2_IRQ_0 => pio::InterruptHandler<PIO2>;
    DMA_IRQ_0 => dma::InterruptHandler<DMA_CH6>, embassy_rp::dma::InterruptHandler<DMA_CH4>, dma::InterruptHandler<DMA_CH2>, dma::InterruptHandler<DMA_CH3>, dma::InterruptHandler<DMA_CH5>;
});

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    // Initialize the allocator BEFORE you use it
    unsafe {
        embedded_alloc::init!(HEAP, 256 * 1024);
    }

    let p = embassy_rp::init(Default::default());

    #[cfg(feature = "wired")]
    let mut led = Output::new(p.PIN_25, Level::Low);

    let watchdog = Arc::new(RwLock::<CriticalSectionRawMutex, _>::new(Watchdog::new(p.WATCHDOG)));

    watchdog.write().await.start(Duration::from_secs(15));

    let ws2812_signal = make_static!(Ws2812Signal, Signal::new());

    #[cfg(feature = "wired")]
    spawner.spawn(ws2812_task(ws2812_signal, p.PIO2, p.DMA_CH6, p.PIN_9).unwrap());

    #[cfg(feature = "wifi")]
    spawner.spawn(ws2812_asm_task(ws2812_signal, p.PIN_9).unwrap());

    // Flash red
    ws2812_signal.signal(Ws2812Message::Flash(50, 5, 127, 0, 0));

    Timer::after_millis(1_000).await;

    #[cfg(feature = "wired")]
    let (ethernet_signal, stack) = tasks::ethernet::init_ethernet(
        spawner, p.SPI0, p.PIN_16, p.PIN_19, p.PIN_18, p.PIN_17, p.PIN_21, p.PIN_20, p.DMA_CH0, p.DMA_CH1,
    )
    .await;

    let pio = p.PIO2;
    let dio = p.PIN_24;
    let clk = p.PIN_29;
    let cs = p.PIN_25;
    let pwr = p.PIN_23;
    let dma = p.DMA_CH6;

    // let pwr = Output::new(pwr, Level::Low);
    let cs = Output::new(cs, Level::High);
    let mut pio = Pio::new(pio, Irqs);
    let spi = PioSpi::new(
        &mut pio.common,
        pio.sm0,
        RM2_CLOCK_DIVIDER,
        pio.irq0,
        cs,
        dio,
        clk,
        dma::Channel::new(dma, Irqs),
    );

    #[cfg(feature = "wifi")]
    let (ethernet_signal, stack) = tasks::wifi::init_wifi(spawner, spi, pwr).await;

    let flash = Flash::new(p.FLASH, p.DMA_CH4, Irqs);

    let local_fs = match LocalFs::new(flash) {
        Ok(local_fs) => {
            info!("Local FS initialised");
            local_fs
        }
        Err(_err) => {
            let p = unsafe { embassy_rp::Peripherals::steal() };
            let flash = Flash::new(p.FLASH, p.DMA_CH4, Irqs);
            LocalFs::make_new_filesystem(flash);
            defmt::panic!("New File System Created! Rebooting...");
        }
    };

    let shared_fs: SharedFs = Arc::new(RwLock::new(local_fs));

    let rfid_signal = make_static!(RfidSignal, Signal::new());
    let button_signal = make_static!(ButtonSignal, Signal::new());
    let door_signal = make_static!(DoorSignal, Signal::new());
    let audio_signal = make_static!(AudioCommandSignal, Signal::new());

    let pio: Peri<'static, PIO1> = p.PIO1;
    let tx_dma: Peri<'static, DMA_CH2> = p.DMA_CH2;
    let rx_dma: Peri<'static, DMA_CH3> = p.DMA_CH3;
    let mosi: Peri<'static, PIN_4> = p.PIN_4;
    let miso: Peri<'static, PIN_5> = p.PIN_5;
    let sclk: Peri<'static, PIN_3> = p.PIN_3;
    let cs: Peri<'static, PIN_2> = p.PIN_2;

    let mut config = embassy_rp::spi::Config::default();
    config.frequency = 100_000;
    let embassy_rp::pio::Pio { mut common, sm0, .. } = embassy_rp::pio::Pio::new(pio, Irqs);
    let mut spi = embassy_rp::pio_programs::spi::Spi::new(&mut common, sm0, sclk, mosi, miso, tx_dma, rx_dma, Irqs, embassy_rp::spi::Config::default());

    // Background tasks
    spawner.spawn(rfid_task(rfid_signal, spi, cs).unwrap());
    spawner.spawn(door_task(door_signal, p.PIN_15).unwrap());
    spawner.spawn(button_task(button_signal, p.PIN_14).unwrap());

    let pio: Peri<'static, PIO0> = p.PIO0;
    let dma: Peri<'static, DMA_CH5> = p.DMA_CH5;
    let data_pin: Peri<'static, PIN_6> = p.PIN_6;
    let bit_clock_pin: Peri<'static, PIN_7> = p.PIN_7;
    let left_right_clock_pin: Peri<'static, PIN_8> = p.PIN_8;

    // Setup pio state machine for i2s output
    let embassy_rp::pio::Pio { mut common, sm0, .. } = embassy_rp::pio::Pio::new(pio, Irqs);

    let program = embassy_rp::pio_programs::i2s::PioI2sOutProgram::new(&mut common);
    let mut i2s = embassy_rp::pio_programs::i2s::PioI2sOut::new(
        &mut common,
        sm0,
        dma,
        Irqs,
        data_pin,
        bit_clock_pin,
        left_right_clock_pin,
        SAMPLE_RATE,
        BIT_DEPTH,
        &program,
    );

    spawner.spawn(audio_task(audio_signal, shared_fs.clone(), i2s).unwrap());

    // Flash white
    ws2812_signal.signal(Ws2812Message::Flash(50, 5, 127, 127, 127));

    let web_socket_outgoing_channel = make_static!(WebSocketOutgoingChannel, Channel::new());
    let web_socket_incoming_channel = make_static!(WebSocketIncomingChannel, Channel::new());

    let file_command_channel = make_static!(FileCommandChannel, Channel::new());
    let file_message_channel = make_static!(FileMessageChannel, Channel::new());

    let default_device_state = DeviceState { latch: false };

    let mut state_service = PermanentStateService::new(shared_fs.clone(), "state.txt".to_string(), default_device_state);
    info!("State service created");

    match state_service.init().await {
        Ok(()) => {
            info!("State service initialised");
        }
        Err(err) => {
            error!("State Service failed to initialised! {:?}", defmt::Debug2Format(&err));
        }
    }

    door_signal.signal(DoorSignalMessage::Latch(state_service.get_data().latch));

    let rfid_last_seen = AtomicU32::new(Instant::now().as_secs() as u32);
    let ws_last_seen = AtomicU32::new(Instant::now().as_secs() as u32);

    let feed_watchdog = || {
        let now = Instant::now().as_secs() as u32;

        let rfid_alive = now - rfid_last_seen.load(Ordering::Relaxed) < 60;
        let ws_alive = now - ws_last_seen.load(Ordering::Relaxed) < 60;

        if rfid_alive && ws_alive {
            if let Ok(mut watchdog) = watchdog.try_write() {
                watchdog.feed(Duration::from_millis(2_000));
            }
        }

        if !rfid_alive {
            error!("RFID malfunction!");
        }
        if !ws_alive {
            error!("WebSocket malfunction!");
        }
    };

    embassy_futures::join::join4(
        async {
            #[cfg(feature = "wifi")]
            let mut led_state = false;

            loop {
                #[cfg(feature = "wired")]
                led.toggle();

                #[cfg(feature = "wifi")]
                {
                    // wifi_control.gpio_set(0, led_state);
                    // led_state = !led_state;
                }

                Timer::after_secs(1).await;
                feed_watchdog();
            }
        },
        async {
            match ethernet_signal.wait().await {
                tasks::common::EthernetSignalMessage::Connected => {
                    audio_signal.signal(AudioCommand::PlayFile("STARTUP.MP3".to_string()));

                    ws2812_signal.signal(Ws2812Message::Flash(50, 5, 0, 0, 255));

                    spawner.spawn(websocket_task(stack, web_socket_outgoing_channel.receiver(), web_socket_incoming_channel.sender()).unwrap());
                    info!("Spawned WebSocket Task");

                    spawner.spawn(file_task(file_command_channel.receiver(), file_message_channel.sender(), shared_fs.clone()).unwrap());
                    info!("Spawned File Task");
                }
            }
        },
        async {
            loop {
                match select3(button_signal.wait(), rfid_signal.wait(), file_message_channel.receive()).await {
                    Either3::First(button) => match button {
                        ButtonSignalMessage::ButtonPressed => {
                            audio_signal.signal(AudioCommand::PlayFile("OPEN.MP3".to_string()));

                            door_signal.signal(DoorSignalMessage::Open(5));
                            Timer::after_secs(5).await;

                            audio_signal.signal(AudioCommand::PlayFile("CLOSE.MP3".to_string()));
                        }
                        ButtonSignalMessage::ButtonLongPressed => {
                            let mut latch_state = state_service.get_data().latch;

                            latch_state = !latch_state;

                            state_service.get_data().latch = latch_state;
                            state_service.save().await.unwrap();

                            door_signal.signal(DoorSignalMessage::Latch(latch_state));

                            web_socket_outgoing_channel.send(WebSocketOutgoing::LatchChanged { latch_state }).await;

                            if latch_state {
                                audio_signal.signal(AudioCommand::PlayFile("LATCHON.MP3".to_string()));
                            } else {
                                audio_signal.signal(AudioCommand::PlayFile("LATCHOFF.MP3".to_string()));
                            }
                        }
                    },
                    Either3::Second(rfid) => match rfid {
                        RfidSignalMessage::Ping => {
                            rfid_last_seen.store(Instant::now().as_secs() as u32, Ordering::Relaxed);
                            feed_watchdog();
                        }
                        RfidSignalMessage::CodeDetected(code) => {
                            info!("Processing code {:?}", code.as_str());

                            match check_code(&*shared_fs.read().await, &code).await {
                                Ok(result) => match result {
                                    services::auth::CheckCodeResult::Valid(name) => {
                                        defmt::info!("VALID: {}", name.as_str());
                                        door_signal.signal(DoorSignalMessage::Open(5));
                                        audio_signal.signal(AudioCommand::PlayFile("SUCCESS.MP3".to_string()));

                                        if let Err(err) = web_socket_outgoing_channel.try_send(WebSocketOutgoing::TagScanned {
                                            allowed: true,
                                            code,
                                            timestamp: 0,
                                        }) {
                                            defmt::error!("Could not push code. Error: {}", defmt::Debug2Format(&err));
                                        }

                                        ws2812_signal.signal(Ws2812Message::Flash(50, 5, 0, 255, 0));
                                    }
                                    services::auth::CheckCodeResult::Invalid => {
                                        defmt::info!("INVALID");
                                        audio_signal.signal(AudioCommand::PlayFile("FAILURE.MP3".to_string()));

                                        if let Err(err) = web_socket_outgoing_channel.try_send(WebSocketOutgoing::TagScanned {
                                            allowed: true,
                                            code,
                                            timestamp: 0,
                                        }) {
                                            defmt::error!("Could not push code. Error: {}", defmt::Debug2Format(&err));
                                        }

                                        ws2812_signal.signal(Ws2812Message::Flash(50, 5, 255, 0, 0));
                                    }
                                },
                                Err(err) => {
                                    defmt::error!("Check Code Error: {}", defmt::Debug2Format(&err));
                                    ws2812_signal.signal(Ws2812Message::Flash(200, 1, 255, 0, 0));
                                }
                            }
                        }
                    },
                    Either3::Third(file_message) => match file_message {
                        FileMessage::ChunkWritten => {
                            web_socket_outgoing_channel
                                .send(WebSocketOutgoing::StatusUpdate {
                                    status: "File".to_string(),
                                    message: "Ready for next chunk".to_string(),
                                })
                                .await;
                        }
                        FileMessage::StartedReading { file_name, length } => {
                            web_socket_outgoing_channel.send(WebSocketOutgoing::FileStart { file_name, length }).await;
                        }
                        FileMessage::ReadChunk(data) => {
                            web_socket_outgoing_channel.send(WebSocketOutgoing::FileData { data }).await;
                        }
                    },
                }
            }
        },
        async {
            loop {
                match web_socket_incoming_channel.receive().await {
                    WebSocketIncoming::Connected => {
                        web_socket_outgoing_channel
                            .send(WebSocketOutgoing::Announce { name: DEVICE_NAME.to_string() })
                            .await;

                        let latch_state = state_service.get_data().latch;

                        web_socket_outgoing_channel.send(WebSocketOutgoing::LatchChanged { latch_state }).await;
                    }
                    WebSocketIncoming::TagInfo { tags } => {
                        let mut codes = "".to_string();

                        for tag in tags {
                            codes += format!("{} {}\n", tag.code, tag.member_name).as_str();
                        }

                        match shared_fs.read().await.write_text_file("codes.txt", &codes) {
                            Ok(()) => info!("Code written successfully"),
                            Err(err) => error!("Code Write Error: {}", defmt::Debug2Format(&err)),
                        }
                    }
                    WebSocketIncoming::LatchChange { latch_state } => {
                        door_signal.signal(DoorSignalMessage::Latch(latch_state));

                        state_service.get_data().latch = latch_state;
                        state_service.save().await.unwrap();

                        web_socket_outgoing_channel.send(WebSocketOutgoing::LatchChanged { latch_state }).await;
                    }
                    WebSocketIncoming::Ping { payload: _ } => {
                        ws_last_seen.store(Instant::now().as_secs() as u32, Ordering::Relaxed);
                        feed_watchdog();

                        web_socket_outgoing_channel
                            .send(WebSocketOutgoing::StatusUpdate {
                                status: "Pong".to_string(),
                                message: "".to_string(),
                            })
                            .await;
                    }
                    WebSocketIncoming::FileRequest { file_name } => {
                        file_command_channel.send(FileCommand::StartReading { file_name }).await;
                    }
                    WebSocketIncoming::FileStart { file_name, length } => {
                        file_command_channel.send(FileCommand::StartWriting { file_name, length }).await;
                    }
                    WebSocketIncoming::FileData { data } => {
                        file_command_channel.send(FileCommand::WriteChunk(data)).await;
                    }
                    WebSocketIncoming::FileDelete { file_name } => {
                        match shared_fs.read().await.delete_file(&file_name) {
                            Ok(()) => {
                                info!("Deleted: {}", file_name.as_str());

                                web_socket_outgoing_channel
                                    .send(WebSocketOutgoing::StatusUpdate {
                                        status: "File".to_string(),
                                        message: format!("File deleted successfully: {}", &file_name),
                                    })
                                    .await;
                            }
                            Err(err) => {
                                error!("File Delete Error: {}", defmt::Debug2Format(&err));
                            }
                        };
                    }
                    WebSocketIncoming::FileList {} => {
                        match shared_fs.read().await.dir() {
                            Ok(list) => {
                                web_socket_outgoing_channel.send(WebSocketOutgoing::FileList { list }).await;
                            }
                            Err(err) => {
                                error!("File List Error: {}", defmt::Debug2Format(&err));
                            }
                        };
                    }
                    WebSocketIncoming::Play { file_name } => {
                        audio_signal.signal(AudioCommand::PlayFile(file_name));
                    }
                }
            }
        },
    )
    .await;

    // loop {
    //     Timer::after_secs(1).await;
    //     info!("Loop");
    // }
}
