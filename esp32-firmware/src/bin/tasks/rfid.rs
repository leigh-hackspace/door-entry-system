use crate::{
    services::common::{MainPublisher, SystemMessage},
    utils::RfidPins,
};
use alloc::string::ToString;
use embassy_time::{Duration, Timer};
use esp_hal::{
    gpio,
    spi::{
        master::{Config, Spi},
        Mode,
    },
    time::RateExtU32,
};
use esp_println::println;
use mfrc522::Mfrc522;

// Hardcoded: 2741061529 / 490399555

// Blue:    3654908809
// Yellow:  308508919

#[embassy_executor::task]
pub async fn rfid_task(publisher: MainPublisher) {
    let pins = RfidPins::new();

    let cs = gpio::Output::new(pins.cs, gpio::Level::Low);

    let spi = Spi::new(pins.spi, Config::default().with_frequency(100.kHz()).with_mode(Mode::_0))
        .unwrap()
        .with_sck(pins.sclk)
        .with_mosi(pins.mosi)
        .with_miso(pins.miso);

    let spi_device_driver = embedded_hal_bus::spi::ExclusiveDevice::new_no_delay(spi, cs).unwrap();

    let itf = mfrc522::comm::blocking::spi::SpiInterface::new(spi_device_driver);

    let mut mfrc522 = Mfrc522::new(itf).init().unwrap();

    let version = mfrc522.version().unwrap();

    println!("VERSION: 0x{:x}", version);

    loop {
        if let Ok(atqa) = mfrc522.reqa() {
            if let Ok(uid) = mfrc522.select(&atqa) {
                let bytes = uid.as_bytes();

                println!("UID: {:?}", bytes);

                let code = to_u32(bytes).unwrap_or_default();

                println!("Code: {:?}", code);

                publisher.publish(SystemMessage::CodeDetected(code.to_string())).await;

                Timer::after(Duration::from_millis(3000)).await;
            }
        }

        Timer::after(Duration::from_millis(100)).await;
    }
}

fn to_u32(bytes: &[u8]) -> Option<u32> {
    // Ensure the slice has exactly 4 bytes
    if bytes.len() == 4 {
        // Convert bytes to u32 assuming little-endian
        Some(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    } else {
        None
    }
}
