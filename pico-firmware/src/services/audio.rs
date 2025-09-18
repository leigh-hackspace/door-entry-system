use crate::utils::{
    decoder::{Frame, MAX_SAMPLES_PER_FRAME, RawDecoder},
    flash_stream::FlashStream,
    local_fs::LocalFs,
};
use alloc::{
    borrow::ToOwned,
    boxed::Box,
    format,
    string::{String, ToString},
    sync::Arc,
    vec::{self, Vec},
};
use core::mem;
use defmt::*;
use embassy_rp::{
    dma::{AnyChannel, Transfer},
    peripherals::PIO0,
    pio_programs::i2s::PioI2sOut,
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, channel::Channel};
use embassy_time::Instant;
use fatfs::{File, LossyOemCpConverter, NullTimeProvider, Read, Seek};
use num_traits::real::Real;

#[derive(Debug)]
pub enum AudioError {
    OpenError(String),
    ReadError(String),
    PlayError(String),
}

const BUFFER_SIZE: usize = 2048;

pub async fn play_mp3<'a>(
    mut i2s: &mut PioI2sOut<'_, PIO0, 0>,
    mut mp3_file: File<'a, FlashStream, NullTimeProvider, LossyOemCpConverter>,
) -> Result<(), AudioError> {
    let channel = Channel::<CriticalSectionRawMutex, Vec<u32>, 4>::new();

    let (_, result) = embassy_futures::join::join(
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
            let mut decoder = Box::new(RawDecoder::new());
            info!("decoder created {}", mem::size_of_val(&decoder));

            let mut file_buf = [0u8; 512];
            let mut frame_buf = Box::new([0i16; MAX_SAMPLES_PER_FRAME]);

            let mut pos = 0usize;
            let mut total_samples = 0u32;

            let started = Instant::now().as_micros();

            let first_read_bytes = mp3_file
                .read(&mut file_buf[0..512])
                .map_err(|err| AudioError::ReadError(format!("{:?}", err)))?;

            info!("Read Header: {}", first_read_bytes);

            let (first_frame, _skip) = match decoder.peek(&file_buf[0..512]) {
                Some(frame) => frame,
                None => {
                    return Err(AudioError::ReadError("Could not decode first frame".to_string()));
                }
            };

            let sample_rate = match first_frame {
                Frame::Audio(audio) => audio.sample_rate(),
                Frame::Other(items) => {
                    return Err(AudioError::ReadError("Could not use first frame".to_string()));
                }
            };

            println!("Sample Rate: {}", sample_rate);

            mp3_file
                .seek(fatfs::SeekFrom::Start(0))
                .map_err(|err| AudioError::ReadError(format!("{:?}", err)))?;

            let mut frame_count = 0;

            loop {
                let mut read_bytes = 0usize;

                loop {
                    let chunk_read_bytes = mp3_file
                        .read(&mut file_buf[read_bytes..])
                        .map_err(|err| AudioError::ReadError(format!("{:?}", err)))?;

                    read_bytes += chunk_read_bytes;

                    if chunk_read_bytes == 0 {
                        break;
                    }
                }

                // info!("read_bytes: Pos={} Len={}", pos, read_bytes);

                if read_bytes == 0 {
                    info!("==== Done playing MP3: {}", total_samples);

                    channel.send(alloc::vec![0u32; 0]).await;

                    return Ok(());
                }

                if let Some((frame, skip)) = decoder.next(&file_buf[0..read_bytes], &mut frame_buf) {
                    pos += skip;

                    mp3_file.seek(fatfs::SeekFrom::Start(pos as u64)).unwrap();

                    match frame {
                        Frame::Audio(audio_data) => {
                            frame_count += 1;

                            let frame_size = audio_data.sample_count();

                            total_samples += frame_size as u32;
                            let frame_decoded_time = Instant::now().as_micros();

                            let real_time = (frame_decoded_time - started) / 1_000;
                            let play_time = 1000 * (total_samples as u64) / sample_rate as u64;

                            let performance = ((play_time as f32 / real_time as f32) * 100f32) as u8;

                            // info!("Frame {}: Time: {}/{} Performance: {}%", frame_count, play_time, real_time, performance);

                            let samples = audio_data.samples();

                            let mut samples_written = 0usize;

                            let mut chunks = 0;

                            while samples_written < frame_size {
                                // info!("samples_written: {}/{}", samples_written, frame_size);

                                // let mut data = [0u32; BUFFER_SIZE];
                                // let mut data = alloc::vec![0u32; BUFFER_SIZE];

                                let samples_room = BUFFER_SIZE;

                                let start = samples_written;
                                let end = (samples_written + samples_room).min(frame_size);

                                let sample_to_write_now = (end - start);

                                let mut data = alloc::vec![0u32; sample_to_write_now];

                                for (i, &sample) in samples[start..end].iter().enumerate() {
                                    data[i] = sample as u32;
                                    // buffers[buffer_index][i] = sample as u32;
                                }

                                // buffer_index = (buffer_index + 1) % buffers.len();

                                channel.send(data).await;

                                samples_written += sample_to_write_now;

                                chunks += 1;
                            }

                            let frame_written_time = Instant::now().as_micros();

                            let write_time = (frame_written_time - frame_decoded_time) / 1_000;

                            // info!("Write Time: {}ms Chunks: {}", write_time, chunks);
                        }
                        Frame::Other(items) => {
                            info!("O:{:?}", items.len());
                        }
                    };
                }
            }
        },
    )
    .await;

    result
}
