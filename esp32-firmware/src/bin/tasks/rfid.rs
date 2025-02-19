use crate::utils::RfidPins;
use alloc::string::{String, ToString};
use embassy_embedded_hal::shared_bus::asynch::spi::SpiDevice;
use embassy_sync::{
    blocking_mutex::raw::{CriticalSectionRawMutex, NoopRawMutex},
    mutex::Mutex,
    signal::Signal,
};
use embassy_time::{Duration, Timer};
use esp_hal::{
    dma::{DmaRxBuf, DmaTxBuf},
    dma_buffers,
    gpio::{Level, Output, OutputConfig},
    peripheral::Peripheral,
    spi::{
        master::{Config, Spi, SpiDmaBus},
        Mode,
    },
    time::Rate,
    Async,
};
use esp_hal_mfrc522::{
    consts::{PCDVersion, UidSize},
    MFRC522,
};
use log::{error, info};

// Hardcoded: 2741061529 / 490399555

// Blue:    3654908809
// Yellow:  308508919

#[derive(PartialEq, Debug)]
pub enum RfidSignalMessage {
    CodeDetected(String),
    Ping,
}

pub type RfidSignal = Signal<CriticalSectionRawMutex, RfidSignalMessage>;

#[embassy_executor::task]
pub async fn rfid_task(signal: &'static RfidSignal) {
    let pins = RfidPins::new();

    let (rx_buffer, rx_descriptors, tx_buffer, tx_descriptors) = dma_buffers!(32000);

    let dma_rx_buf = DmaRxBuf::new(rx_descriptors, rx_buffer).unwrap();
    let dma_tx_buf = DmaTxBuf::new(tx_descriptors, tx_buffer).unwrap();

    let cs = Output::new(pins.cs, Level::High, OutputConfig::default());
    let cs2 = unsafe { cs.clone_unchecked() };

    let spi = Spi::new(pins.spi, Config::default().with_frequency(Rate::from_khz(100)).with_mode(Mode::_0)).unwrap();

    let spi = spi.with_sck(pins.sclk).with_miso(pins.miso).with_mosi(pins.mosi);
    let spi = spi.with_dma(pins.dma).with_buffers(dma_rx_buf, dma_tx_buf).into_async();

    let mutex = Mutex::<NoopRawMutex, SpiDmaBus<'_, Async>>::new(spi);

    let spi_device = SpiDevice::new(&mutex, cs);

    let mut mfrc522 = MFRC522::new(spi_device);

    mfrc522.pcd_init().await.ok();
    mfrc522.pcd_selftest().await.ok();

    info!("PCD ver: {:?}", mfrc522.pcd_get_version().await);

    if !mfrc522.pcd_is_init().await {
        error!("MFRC522 init failed! Try to power cycle to module!");
    }

    let mut loop_count = 0;

    loop {
        if mfrc522.picc_is_new_card_present().await.is_ok() {
            let card = mfrc522.get_card(UidSize::Four).await;

            if let Ok(card) = card {
                let code = card.get_number();
                info!("Card UID: {}", code);

                signal.signal(RfidSignalMessage::CodeDetected(code.to_string()));
            }

            mfrc522.picc_halta().await.ok();
        }

        Timer::after(Duration::from_millis(10)).await;

        if loop_count % 100 == 0 {
            if let Ok(version) = mfrc522.pcd_get_version().await {
                if version == PCDVersion::Version2_0 {
                    signal.signal(RfidSignalMessage::Ping);
                }
            }
        }

        loop_count += 1;
    }
}
