use crate::services::common::{MainPublisher, SystemMessage};
use alloc::string::ToString;
use embassy_time::{Duration, Timer};
use esp_hal::{
    gpio,
    peripherals::Peripherals,
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
    let peripherals = unsafe { Peripherals::steal() };

    let cs = gpio::Output::new(peripherals.GPIO25, gpio::Level::Low);

    let sclk = peripherals.GPIO26;
    let miso = peripherals.GPIO14;
    let mosi = peripherals.GPIO27;

    let spi = Spi::new(peripherals.SPI3, Config::default().with_frequency(100.kHz()).with_mode(Mode::_0))
        .unwrap()
        .with_sck(sclk)
        .with_mosi(mosi)
        .with_miso(miso);

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
