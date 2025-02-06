use crate::utils::{
    decoder::{Frame, RawDecoder, MAX_SAMPLES_PER_FRAME},
    local_fs::LocalFs,
};
use alloc::{
    boxed::Box,
    format,
    string::{String, ToString},
};
use core::mem;
use esp_hal::{
    dma_buffers,
    i2s::master::{DataFormat, I2s, Standard},
    peripherals::Peripherals,
    time::RateExtU32,
};
use esp_println::println;
use esp_storage::FlashStorage;
use fatfs::{Read, Seek};
use log::info;

#[derive(Debug)]
pub enum AudioError {
    OpenError(String),
    ReadError(String),
    PlayError(String),
}

pub async fn play_mp3(file: String) -> Result<(), AudioError> {
    info!("==== play_mp3: {}", file);

    let mut decoder = Box::new(RawDecoder::new());
    info!("decoder created {}", mem::size_of_val(&decoder));

    let mut file_buf = [0u8; 512];
    let mut frame_buf = [0i16; MAX_SAMPLES_PER_FRAME];

    let mut flash = FlashStorage::new();
    let local_fs = LocalFs::new(&mut flash);
    info!("fs loaded");

    let peripherals = unsafe { Peripherals::steal() };

    let dma_channel = peripherals.DMA_I2S0;

    let (_, rx_descriptors, tx_buffer, tx_descriptors) = dma_buffers!(0, 16000);
    info!("dma init");

    info!("==== Play: {}", file);

    let mut pos = 0usize;
    let mut total_samples = 0u32;

    let mut mp3_file = local_fs
        .open_file(&file)
        .map_err(|err| AudioError::OpenError(format!("{:?}", err)))?;

    let first_read_bytes = mp3_file
        .read(&mut file_buf)
        .map_err(|err| AudioError::ReadError(format!("{:?}", err)))?;

    println!("Read Header: {}", first_read_bytes);

    let (first_frame, _skip) = match decoder.peek(&file_buf) {
        Some(frame) => frame,
        None => {
            return Err(AudioError::ReadError("Could not decode first frame".to_string()));
        }
    };

    let sample_rate = match first_frame {
        Frame::Audio(audio) => audio.sample_rate(),
        Frame::Other(items) => {
            return Err(AudioError::ReadError("Could not first first frame".to_string()));
        }
    };

    println!("Sample Rate: {}", sample_rate);

    mp3_file
        .seek(fatfs::SeekFrom::Start(0))
        .map_err(|err| AudioError::ReadError(format!("{:?}", err)))?;

    let i2s = I2s::new(
        peripherals.I2S0,
        Standard::Philips,
        DataFormat::Data16Channel16,
        sample_rate.Hz(),
        dma_channel,
        rx_descriptors,
        tx_descriptors,
    )
    .into_async();
    info!("i2s init");

    let mut i2s_tx = i2s
        .i2s_tx
        .with_bclk(peripherals.GPIO16)
        .with_ws(peripherals.GPIO4)
        .with_dout(peripherals.GPIO17)
        .build();

    tx_buffer.fill_with(|| 0);

    let mut transaction = i2s_tx.write_dma_circular_async(tx_buffer).unwrap();

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
            info!("==== Done playing MP3: {} {}", file, total_samples);

            // transaction.stop().map_err(|err| AudioError::PlayError(format!("{:?}", err)))?;

            return Ok(());
        }

        if let Some((frame, skip)) = decoder.next(&file_buf[0..read_bytes], &mut frame_buf) {
            pos += skip;

            mp3_file.seek(fatfs::SeekFrom::Start(pos as u64)).unwrap();

            match frame {
                Frame::Audio(audio_data) => {
                    let frame_size = audio_data.sample_count();

                    total_samples += frame_size as u32;

                    let samples = audio_data.samples();

                    let mut samples_written = 0usize;

                    while samples_written < frame_size {
                        samples_written += match transaction
                            .push_with(|data| {
                                let samples_room = data.len() / 4;

                                let start = samples_written;
                                let end = (samples_written + samples_room).min(frame_size);

                                // We need to write each sample twice (presumably because the DAC expects a stereo signal)
                                for (i, &sample) in samples[start..end].iter().enumerate() {
                                    let bytes = sample.to_le_bytes();
                                    let pos = i * 4;

                                    data[pos + 0..pos + 2].copy_from_slice(&bytes);
                                    data[pos + 2..pos + 4].copy_from_slice(&bytes);
                                }

                                (end - start) * 4
                            })
                            .await
                        {
                            Ok(size) => size / 4,
                            Err(err) => {
                                println!("Write Error:{:?}", err);
                                0
                            }
                        };
                    }
                }
                Frame::Other(items) => {
                    info!("O:{:?}", items.len());
                }
            };
        }
    }
}

pub async fn play_wav(file: String, sample_rate: u32) {
    info!("==== play_wav: {}", file);

    let mut file_buf = Box::new([0u8; 1024]);
    let mut output_buf = Box::new([0u8; 2048]);

    let mut flash = FlashStorage::new();
    let local_fs = LocalFs::new(&mut flash);

    let peripherals = unsafe { Peripherals::steal() };

    let dma_channel = peripherals.DMA_I2S0;

    let (_, rx_descriptors, tx_buffer, tx_descriptors) = dma_buffers!(0, 16000);

    let i2s = I2s::new(
        peripherals.I2S0,
        Standard::Philips,
        DataFormat::Data16Channel16,
        sample_rate.Hz(),
        dma_channel,
        rx_descriptors,
        tx_descriptors,
    )
    .into_async();

    let i2s_tx = i2s
        .i2s_tx
        .with_bclk(peripherals.GPIO16)
        .with_ws(peripherals.GPIO4)
        .with_dout(peripherals.GPIO17)
        .build();

    let mut transaction = i2s_tx.write_dma_circular_async(tx_buffer).unwrap();

    info!("==== Play: {}", file);

    let mut wav_file = match local_fs.open_file(&file) {
        Err(err) => {
            println!("Open Error:{:?}", err);
            return;
        }
        Ok(wav) => wav,
    };

    let mut header = [0u8; 128];

    // Discard the header
    wav_file.read(&mut header).unwrap();

    let mut total_samples = 0u32;

    loop {
        if let Ok(read_bytes) = wav_file.read(file_buf.as_mut_slice()) {
            // println!("Read:{}", read_bytes);

            if read_bytes > 0 {
                total_samples += read_bytes as u32 / 2;

                for b in 0..(read_bytes - 1) {
                    if b % 2 != 0 {
                        continue;
                    }
                    output_buf[b * 2 + 0] = file_buf[b + 0];
                    output_buf[b * 2 + 1] = file_buf[b + 1];
                    output_buf[b * 2 + 2] = file_buf[b + 0];
                    output_buf[b * 2 + 3] = file_buf[b + 1];
                }
            } else {
                info!("==== Done playing WAV: {} {}", file, total_samples);

                return;
            }

            if let Err(err) = transaction.push(output_buf.as_mut_slice()).await {
                println!("Write Error:{:?}", err);
            }
        }
    }
}

pub async fn play_file(file: String) -> Result<(), AudioError> {
    if file.ends_with(".mp3") {
        play_mp3(file).await?
    } else if file.ends_with(".wav") {
        // play_wav(file, 16000).await;
    }

    Ok(())
}
