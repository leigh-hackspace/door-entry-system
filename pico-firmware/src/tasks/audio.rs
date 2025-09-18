use crate::{services::audio::play_mp3, utils::common::SharedFs};
use alloc::string::String;
use defmt::*;
use embassy_rp::{
    Peri,
    peripherals::{DMA_CH5, PIN_6, PIN_7, PIN_8, PIO0},
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};

embassy_rp::bind_interrupts!(struct Irqs {
    PIO0_IRQ_0 => embassy_rp::pio::InterruptHandler<embassy_rp::peripherals::PIO0>;
});

#[derive(PartialEq, Debug)]
pub enum AudioCommand {
    PlayFile(String),
}

pub type AudioCommandSignal = Signal<CriticalSectionRawMutex, AudioCommand>;

const SAMPLE_RATE: u32 = 22_050;
const BIT_DEPTH: u32 = 16;

#[embassy_executor::task]
pub async fn audio_task(
    signal: &'static AudioCommandSignal,
    shared_fs: SharedFs,
    pio: Peri<'static, PIO0>,
    dma: Peri<'static, DMA_CH5>,
    data_pin: Peri<'static, PIN_6>,
    bit_clock_pin: Peri<'static, PIN_7>,
    left_right_clock_pin: Peri<'static, PIN_8>,
) {
    // Setup pio state machine for i2s output
    let embassy_rp::pio::Pio { mut common, sm0, .. } = embassy_rp::pio::Pio::new(pio, Irqs);

    let program = embassy_rp::pio_programs::i2s::PioI2sOutProgram::new(&mut common);
    let mut i2s = embassy_rp::pio_programs::i2s::PioI2sOut::new(
        &mut common,
        sm0,
        dma,
        data_pin,
        bit_clock_pin,
        left_right_clock_pin,
        SAMPLE_RATE,
        BIT_DEPTH,
        &program,
    );

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
                        continue;;
                    }
                }

                if let Ok(file) = local_fs.open_file(&file_name) {
                    if let Err(err) = play_mp3(&mut i2s, file).await {
                        error!("Play Error: {}", defmt::Debug2Format(&err));
                    }
                }
            }
        }
    }
}
