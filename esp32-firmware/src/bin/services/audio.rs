use crate::utils::local_fs::LocalFs;
use alloc::string::String;
use esp_hal::{
    dma::{Dma, DmaPriority},
    dma_buffers,
    i2s::master::{DataFormat, I2s, Standard},
    peripherals::Peripherals,
    prelude::*,
};
use esp_println::println;
use esp_storage::FlashStorage;
use fatfs::Read;
use log::info;

pub async fn play_file(file: String) {
    let mut file_buf = [0u8; 1024];
    let mut output_buf = [0u8; 2048];

    let mut flash = FlashStorage::new();
    let local_fs = LocalFs::new(&mut flash);

    let peripherals = unsafe { Peripherals::steal() };

    let dma = Dma::new(peripherals.DMA);
    let dma_channel = dma.i2s0channel.configure(false, DmaPriority::Priority0);

    let (_, rx_descriptors, tx_buffer, tx_descriptors) = dma_buffers!(0, 32000);

    let i2s = I2s::new(
        peripherals.I2S0,
        Standard::Philips,
        DataFormat::Data16Channel16,
        16000u32.Hz(),
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

    match local_fs.open_file(&file) {
        Err(err) => {
            println!("Open Error:{:?}", err);
        }
        Ok(mut wav) => {
            let mut header = [0u8; 128];

            // Discard the header
            wav.read(&mut header).unwrap();

            loop {
                if let Ok(read_bytes) = wav.read(&mut file_buf) {
                    // println!("Read:{}", read_bytes);

                    if read_bytes > 0 {
                        for b in 0..(read_bytes - 1) {
                            if b % 2 != 0 {
                                continue;
                            }
                            output_buf[b * 2 + 0] = file_buf[b + 0];
                            output_buf[b * 2 + 1] = file_buf[b + 1];
                            output_buf[b * 2 + 2] = file_buf[b + 0];
                            output_buf[b * 2 + 3] = file_buf[b + 1];
                        }
                    }

                    if read_bytes == 0 {
                        info!("==== Done playing: {}", file);

                        // Flush
                        let filler = [0u8; 1024];

                        for i in 0..32 {
                            match transaction.push(&filler).await {
                                Ok(_) => {}
                                Err(_) => {}
                            }
                        }

                        break;
                    }

                    match transaction.push(&output_buf).await {
                        Err(err) => {
                            println!("Write Error:{:?}", err);
                        }
                        Ok(written) => {
                            // println!("Written:{}", written);
                        }
                    }
                }
            }
        }
    };
}
