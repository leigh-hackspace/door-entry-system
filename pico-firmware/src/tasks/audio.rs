use crate::{services::audio::play_mp3, utils::common::SharedFs};
use alloc::{string::String, vec::Vec};
use defmt::*;
use embassy_rp::{peripherals::PIO0, pio_programs::i2s::PioI2sOut};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, channel::Channel, signal::Signal};
use libm::sin;

#[derive(PartialEq, Debug)]
pub enum AudioCommand {
    PlayFile(String),
    PlaySine(u32),
}

pub type AudioCommandSignal = Signal<CriticalSectionRawMutex, AudioCommand>;

#[embassy_executor::task]
pub async fn audio_task(signal: &'static AudioCommandSignal, shared_fs: SharedFs, mut i2s: PioI2sOut<'static, PIO0, 0>) {
    loop {
        match signal.wait().await {
            AudioCommand::PlayFile(file_name) => {
                let local_fs = shared_fs.read().await;

                match local_fs.get_file_size(&file_name) {
                    Ok(size) => {
                        info!("File Size: {}", size);
                    }
                    Err(err) => {
                        error!("File Size Error: {}", defmt::Debug2Format(&err));
                        continue;
                    }
                }

                if let Ok(file) = local_fs.open_file(&file_name) {
                    if let Err(err) = play_mp3(&mut i2s, file).await {
                        error!("Play Error: {}", defmt::Debug2Format(&err));
                    }
                }
            }
            AudioCommand::PlaySine(pitch) => {
                // Each element is 2 stereo 16-bit samples
                let channel = Channel::<CriticalSectionRawMutex, Vec<u32>, 4>::new();

                embassy_futures::join::join(
                    async {
                        loop {
                            let buf = channel.receive().await;

                            if buf.len() == 0 {
                                return;
                            }

                            i2s.write(&*buf).await;
                        }
                    },
                    async {
                        const SAMPLE_RATE: u32 = 22_050; // Hertz
                        const BIT_DEPTH: u32 = 16;
                        // const PITCH: u32 = 440; // Hertz (A)
                        const PLAY_LENGTH: u32 = 500; // Milliseconds
                        // const AMPLITUDE: f64 = 32767.0;
                        const AMPLITUDE: f64 = 8192.0;

                        let mut sample_index = 0u32;
                        let total_samples = (SAMPLE_RATE * PLAY_LENGTH) / 1000;

                        loop {
                            let mut buf = alloc::vec![0u32; 4096];

                            for i in 0..buf.len() {
                                // Calculate the sine wave value
                                let t = sample_index as f64 / SAMPLE_RATE as f64;
                                let sine_value = sin((2.0 * core::f64::consts::PI * pitch as f64 * t));

                                // Convert to 16-bit signed integer
                                let sample_16bit = (sine_value * AMPLITUDE) as i16;

                                // Pack two 16-bit samples (left and right stereo channels) into one u32
                                // Both channels get the same value for mono content
                                let left = sample_16bit as u16;
                                let right = sample_16bit as u16;
                                buf[i] = ((right as u32) << 16) | (left as u32);

                                sample_index += 1;
                            }

                            // Write them
                            channel.send(buf).await;

                            // Check if we've completed the play length
                            if sample_index >= total_samples {
                                // Terminate
                                channel.send(alloc::vec![0u32; 0]).await;

                                break; // Exit after 1000ms
                            }
                        }
                    },
                )
                .await;
            }
        }
    }
}
