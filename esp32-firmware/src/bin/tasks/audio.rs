use alloc::string::String;
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};

use crate::services::audio::play_file;

#[derive(PartialEq, Debug)]
pub enum AudioSignal {
    Play(String, u32),
}

#[embassy_executor::task]
pub async fn audio_task(signal: &'static Signal<CriticalSectionRawMutex, AudioSignal>) {
    loop {
        if let AudioSignal::Play(file, sample_rate) = signal.wait().await {
            play_file(file, sample_rate).await;
        }
    }
}
