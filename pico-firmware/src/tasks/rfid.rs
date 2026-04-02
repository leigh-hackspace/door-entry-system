use alloc::string::{String, ToString};
use defmt::*;
use embassy_rp::{
    Peri,
    gpio::{Level, Output},
    peripherals::{PIN_2, PIO1},
    pio_programs::spi::Spi,
    spi::Async,
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Timer};
use embedded_hal_bus::spi::ExclusiveDevice;
use esp_hal_mfrc522::{
    MFRC522,
    consts::{PCDVersion, UidSize},
    drivers::SpiDriver,
};

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
pub async fn rfid_task(signal: &'static RfidSignal, spi: Spi<'static, PIO1, 0, Async>, cs: Peri<'static, PIN_2>) {
    let cs = Output::new(cs, Level::High);

    let spi_device = ExclusiveDevice::new_no_delay(spi, cs).unwrap();

    // let spi_device = SpiDevice::new(&spi_mutex, cs);
    let spi_driver = SpiDriver::new(spi_device);

    let mut mfrc522 = MFRC522::new(spi_driver, || embassy_time::Instant::now().as_micros());

    mfrc522.pcd_init().await.ok();
    mfrc522.pcd_selftest().await.ok();

    info!("PCD ver: {}", defmt::Debug2Format(&mfrc522.pcd_get_version().await));

    if !mfrc522.pcd_is_init().await {
        error!("MFRC522 init failed! Try to power cycle to module!");
    }

    let mut loop_count = 0;

    loop {
        // info!("Looping... 1");

        if mfrc522.picc_is_new_card_present().await.is_ok() {
            let card = mfrc522.get_card(UidSize::Four).await;

            if let Ok(card) = card {
                let code = card.get_number();
                info!("Card UID: {}", code);

                signal.signal(RfidSignalMessage::CodeDetected(code.to_string()));
            }

            mfrc522.picc_halta().await.ok();
        }

        // info!("Looping... 2");

        Timer::after(Duration::from_millis(100)).await;

        // info!("Looping... 3");

        if loop_count % 100 == 0 {
            if let Ok(version) = mfrc522.pcd_get_version().await {
                info!("{}", defmt::Debug2Format(&version));

                if version == PCDVersion::Version2_0 {
                    signal.signal(RfidSignalMessage::Ping);
                }
            }
        }

        // info!("Looping... 4");

        loop_count += 1;
    }
}
