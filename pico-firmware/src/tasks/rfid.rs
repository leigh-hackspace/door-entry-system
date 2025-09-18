use alloc::string::{String, ToString};
use defmt::*;
use embassy_embedded_hal::shared_bus::asynch::spi::SpiDevice;
use embassy_rp::{
    Peri,
    gpio::{Level, Output},
    peripherals::{DMA_CH2, DMA_CH3, PIN_2, PIN_3, PIN_4, PIN_5, PIN_10, PIN_11, PIN_12, PIN_13, PIO1},
};
use embassy_sync::{
    blocking_mutex::raw::{CriticalSectionRawMutex, NoopRawMutex},
    mutex::Mutex,
    signal::Signal,
};
use embassy_time::{Duration, Timer};
use embedded_hal::digital::OutputPin;
use embedded_hal_bus::spi::ExclusiveDevice;
use esp_hal_mfrc522::{
    MFRC522,
    consts::{PCDVersion, UidSize},
    drivers::SpiDriver,
};

// Hardcoded: 2741061529 / 490399555

// Blue:    3654908809
// Yellow:  308508919

embassy_rp::bind_interrupts!(struct Irqs {
    PIO1_IRQ_0 => embassy_rp::pio::InterruptHandler<embassy_rp::peripherals::PIO1>;
});

#[derive(PartialEq, Debug)]
pub enum RfidSignalMessage {
    CodeDetected(String),
    Ping,
}

pub type RfidSignal = Signal<CriticalSectionRawMutex, RfidSignalMessage>;

#[embassy_executor::task]
pub async fn rfid_task(
    signal: &'static RfidSignal,
    pio: Peri<'static, PIO1>,
    tx_dma: Peri<'static, DMA_CH2>,
    rx_dma: Peri<'static, DMA_CH3>,
    // mosi: Peri<'static, PIN_11>,
    // miso: Peri<'static, PIN_12>,
    // sclk: Peri<'static, PIN_10>,
    // cs: Peri<'static, PIN_13>,
    mosi: Peri<'static, PIN_4>,
    miso: Peri<'static, PIN_5>,
    sclk: Peri<'static, PIN_3>,
    cs: Peri<'static, PIN_2>,
) {
    // let p = unsafe { embassy_rp::Peripherals::steal() };

    // let miso = p.PIN_12;
    // let mosi = p.PIN_11;
    // let sclk = p.PIN_10;
    // let cs = p.PIN_13;
    // let tx_dma = p.DMA_CH2;
    // let rx_dma = p.DMA_CH3;

    let mut config = embassy_rp::spi::Config::default();

    config.frequency = 100_000;

    // let mut spi = embassy_rp::spi::Spi::new(p.SPI1, sclk, mosi, miso, p.DMA_CH2, p.DMA_CH3, config);

    let embassy_rp::pio::Pio { mut common, sm0, .. } = embassy_rp::pio::Pio::new(pio, Irqs);

    let mut spi = embassy_rp::pio_programs::spi::Spi::new(&mut common, sm0, sclk, mosi, miso, tx_dma, rx_dma, embassy_rp::spi::Config::default());

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
