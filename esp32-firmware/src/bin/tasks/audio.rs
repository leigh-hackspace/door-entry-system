use crate::{services::audio::play_file, utils::decoder::RawDecoder};
use alloc::{boxed::Box, string::String, sync::Arc};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, mutex::Mutex, signal::Signal};
use esp_hal::Cpu;
use log::{error, info};

#[derive(PartialEq, Debug)]
pub enum AudioSignal {
    Play(String),
}

#[embassy_executor::task]
pub async fn audio_task(
    /*decoder: Arc<Mutex<CriticalSectionRawMutex, Box<RawDecoder>>>,*/
    signal: &'static Signal<CriticalSectionRawMutex, AudioSignal>,
) {
    info!("#### Starting audio_task() on core {}", Cpu::current() as usize);

    loop {
        // let decoder = decoder.clone();

        if let AudioSignal::Play(file) = signal.wait().await {
            info!("#### Play {}", file);

            if let Err(err) = play_file(/*decoder, */ file).await {
                error!("audio_task: {:?}", err);
            }
        }
    }
}
