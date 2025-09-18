//! This example implements a TCP client that attempts to connect to a host on port 1234 and send it some data once per second.
//!
//! Example written for the [`WIZnet W6100-EVB-Pico2`](https://docs.wiznet.io/Product/iEthernet/W6100/W6100-evb-pico2) board.

#![no_std]
#![no_main]
#![feature(future_join)]

extern crate alloc;

mod services;
mod tasks;
mod utils;

use crate::services::audio::play_mp3;
use crate::services::{auth::check_code, common::DeviceState};
use crate::tasks::audio::{AudioCommand, AudioCommandSignal, audio_task};
use crate::tasks::button::{ButtonSignal, ButtonSignalMessage, button_task};
use crate::tasks::ethernet::init_ethernet;
use crate::tasks::file::{FileCommand, FileCommandChannel, FileMessage, FileMessageChannel, file_task};
use crate::tasks::rfid::{RfidSignal, RfidSignalMessage, rfid_task};
use crate::tasks::websocket::{WebSocketIncomingChannel, WebSocketOutgoingChannel, WebSocketOutgoingReceiver};
use crate::tasks::ws2812::{Ws2812Message, Ws2812Signal, ws2812_task};
use crate::utils::flash_stream::FlashStream;
use crate::utils::local_fs::{self, LocalFs};
use crate::{
    services::state::PermanentStateService,
    tasks::door::{DoorSignal, DoorSignalMessage, door_task},
};
use crate::{
    tasks::websocket::{WebSocketIncoming, WebSocketOutgoing, websocket_task},
    utils::common::{Flash, SharedFs},
};
use alloc::borrow::ToOwned;
use alloc::boxed::Box;
use alloc::format;
use alloc::string::ToString;
use alloc::sync::Arc;
use alloc::vec::Vec;
use core::cell::UnsafeCell;
use core::sync::atomic::{AtomicU32, Ordering};
use defmt::*;
use embassy_executor::Spawner;
use embassy_futures::select::{Either, Either3, Either4, select, select3, select4};
use embassy_futures::yield_now;
use embassy_rp::flash::ERASE_SIZE;
use embassy_rp::gpio::{Level, Output};
use embassy_rp::watchdog::Watchdog;
use embassy_sync::channel::Channel;
use embassy_sync::signal::Signal;
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, rwlock::RwLock};
use embassy_time::{Duration, Instant, Timer};
use embedded_alloc::LlffHeap as Heap;
use fatfs::{File, LossyOemCpConverter, NullTimeProvider, Write};
use {defmt_rtt as _, panic_probe as _};

#[global_allocator]
static HEAP: Heap = Heap::empty();

// embassy_rp::bind_interrupts!(struct Irqs {
//     PIO0_IRQ_0 => embassy_rp::pio::InterruptHandler<embassy_rp::peripherals::PIO0>;
// });

const DEVICE_NAME: &str = env!("DEVICE_NAME");

// const SAMPLE_RATE: u32 = 22_050;
// const BIT_DEPTH: u32 = 16;

// #[cortex_m_rt::entry]
// fn main() -> ! {
//     loop {}
// }

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    // Initialize the allocator BEFORE you use it
    unsafe {
        embedded_alloc::init!(HEAP, 256 * 1024);
    }

    let p = embassy_rp::init(Default::default());
    let mut led = Output::new(p.PIN_25, Level::Low);

    let watchdog = Arc::new(RwLock::<CriticalSectionRawMutex, _>::new(Watchdog::new(p.WATCHDOG)));

    watchdog.write().await.start(Duration::from_secs(15));

    let (ethernet_signal, stack) = init_ethernet(
        spawner, p.SPI0, p.PIN_16, p.PIN_19, p.PIN_18, p.PIN_17, p.PIN_21, p.PIN_20, p.DMA_CH0, p.DMA_CH1,
    )
    .await;

    let flash = Flash::new(p.FLASH, p.DMA_CH4);

    let local_fs = match LocalFs::new(flash) {
        Ok(local_fs) => {
            info!("Local FS initialised");
            local_fs
        }
        Err(_err) => {
            let p = unsafe { embassy_rp::Peripherals::steal() };
            let flash = Flash::new(p.FLASH, p.DMA_CH4);
            LocalFs::make_new_filesystem(flash);
            defmt::panic!("New File System Created! Rebooting...");
        }
    };

    let shared_fs: SharedFs = Arc::new(RwLock::new(local_fs));

    let rfid_signal = make_static!(RfidSignal, Signal::new());
    let button_signal = make_static!(ButtonSignal, Signal::new());
    let door_signal = make_static!(DoorSignal, Signal::new());
    let audio_signal = make_static!(AudioCommandSignal, Signal::new());
    let ws2812_signal = make_static!(Ws2812Signal, Signal::new());

    // Background tasks
    // spawner.spawn(rfid_task(rfid_signal, p.PIO1, p.DMA_CH2, p.DMA_CH3, p.PIN_11, p.PIN_12, p.PIN_10, p.PIN_13).unwrap());
    spawner.spawn(rfid_task(rfid_signal, p.PIO1, p.DMA_CH2, p.DMA_CH3, p.PIN_4, p.PIN_5, p.PIN_3, p.PIN_2).unwrap());
    spawner.spawn(door_task(door_signal, p.PIN_15).unwrap());
    spawner.spawn(button_task(button_signal, p.PIN_14).unwrap());
    spawner.spawn(audio_task(audio_signal, shared_fs.clone(), p.PIO0, p.DMA_CH5, p.PIN_6, p.PIN_7, p.PIN_8).unwrap());
    spawner.spawn(ws2812_task(ws2812_signal, p.PIO2, p.DMA_CH6, p.PIN_9).unwrap());

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
                watchdog.feed();
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
            loop {
                led.toggle();
                Timer::after_secs(1).await;
                feed_watchdog();
            }
        },
        async {
            match ethernet_signal.wait().await {
                tasks::ethernet::EthernetSignalMessage::Connected => {
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
                                        web_socket_outgoing_channel
                                            .send(WebSocketOutgoing::TagScanned {
                                                allowed: true,
                                                code,
                                                timestamp: 0,
                                            })
                                            .await;
                                        ws2812_signal.signal(Ws2812Message::Flash(50, 5, 0, 255, 0));
                                    }
                                    services::auth::CheckCodeResult::Invalid => {
                                        defmt::info!("INVALID");
                                        audio_signal.signal(AudioCommand::PlayFile("FAILURE.MP3".to_string()));
                                        web_socket_outgoing_channel
                                            .send(WebSocketOutgoing::TagScanned {
                                                allowed: false,
                                                code,
                                                timestamp: 0,
                                            })
                                            .await;
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
                    WebSocketIncoming::Ping { payload } => {
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
