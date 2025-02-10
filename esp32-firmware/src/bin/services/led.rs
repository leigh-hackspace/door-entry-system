use esp_hal::{
    dma::{DmaRxBuf, DmaTxBuf},
    dma_buffers,
    gpio::{self, InputConfig, OutputConfig},
    peripherals::Peripherals,
    spi::{
        master::{Config, Spi},
        Mode,
    },
    time::Rate,
};
use log::info;
use smart_leds::RGB8;
use ws2812_async::{ColorOrder, Ws2812};

const NUM_LEDS: usize = 1;

pub async fn set_led(r: u8, g: u8, b: u8) {
    info!("R:{r} G:{g} B:{b}");

    let peripherals = unsafe { Peripherals::steal() };

    let (rx_buffer, rx_descriptors, tx_buffer, tx_descriptors) = dma_buffers!(128);
    let dma_rx_buf = DmaRxBuf::new(rx_descriptors, rx_buffer).unwrap();
    let dma_tx_buf = DmaTxBuf::new(tx_descriptors, tx_buffer).unwrap();

    let mut spi = Spi::new(
        peripherals.SPI2,
        Config::default().with_frequency(Rate::from_khz(3_000)).with_mode(Mode::_0),
    )
    .unwrap()
    .with_mosi(peripherals.GPIO8)
    .with_dma(peripherals.DMA_CH0)
    .with_buffers(dma_rx_buf, dma_tx_buf)
    .into_async();

    let mut ws: Ws2812<_, { 12 * NUM_LEDS }> = Ws2812::new(&mut spi);

    ws.set_color_order(ColorOrder::GRB);

    let mut data = [RGB8::default(); NUM_LEDS];

    data[0].r = r;
    data[0].g = g;
    data[0].b = b;

    ws.write(data.iter().cloned()).await.ok();
    ws.write(data.iter().cloned()).await.ok();

    // For some reason this resets the GPIO
    gpio::Output::new(
        unsafe { esp_hal::peripherals::Peripherals::steal() }.GPIO8,
        gpio::Level::Low,
        OutputConfig::default(),
    );
    gpio::Input::new(unsafe { esp_hal::peripherals::Peripherals::steal() }.GPIO8, InputConfig::default());
}
