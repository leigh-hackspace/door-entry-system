use alloc::string::{String, ToString};
use esp_hal::{
    dma::{DmaChannel0, DmaChannel1},
    gpio::GpioPin,
    peripherals::{Peripherals, I2S0, SPI2},
};

pub mod ctest;
pub mod decoder;
// pub mod ffi;
pub mod flash_stream;
pub mod local_fs;

/// Replacement for [`static_cell::make_static`](https://docs.rs/static_cell/latest/static_cell/macro.make_static.html) for use cases when the type is known.
#[macro_export]
macro_rules! make_static {
    ($t:ty, $val:expr) => ($crate::make_static!($t, $val,));
    ($t:ty, $val:expr, $(#[$m:meta])*) => {{
        $(#[$m])*
        static STATIC_CELL: static_cell::StaticCell<$t> = static_cell::StaticCell::new();
        STATIC_CELL.init($val)
    }};
}

pub struct I2sPins {
    pub bclk: GpioPin<6>,
    pub ws: GpioPin<5>,
    pub dout: GpioPin<7>,
    pub i2s: I2S0,
    pub dma: DmaChannel1,
}

impl I2sPins {
    pub fn new() -> Self {
        let peripherals = unsafe { Peripherals::steal() };

        Self {
            bclk: peripherals.GPIO6,
            ws: peripherals.GPIO5,
            dout: peripherals.GPIO7,
            i2s: peripherals.I2S0,
            dma: peripherals.DMA_CH1,
        }
    }
}

pub struct RfidPins {
    pub sclk: GpioPin<15>,
    pub miso: GpioPin<19>,
    pub mosi: GpioPin<18>,
    pub cs: GpioPin<14>,
    pub spi: SPI2,
    pub dma: DmaChannel0,
}

impl RfidPins {
    pub fn new() -> Self {
        let peripherals = unsafe { Peripherals::steal() };

        Self {
            sclk: peripherals.GPIO15,
            miso: peripherals.GPIO19,
            mosi: peripherals.GPIO18,
            cs: peripherals.GPIO14,
            spi: peripherals.SPI2,
            dma: peripherals.DMA_CH0,
        }
    }
}

pub struct ButtonPins {
    pub button: GpioPin<1>,
}

impl ButtonPins {
    pub fn new() -> Self {
        let peripherals = unsafe { Peripherals::steal() };

        Self { button: peripherals.GPIO1 }
    }
}

pub struct DoorPins {
    pub door: GpioPin<2>,
}

impl DoorPins {
    pub fn new() -> Self {
        let peripherals = unsafe { Peripherals::steal() };

        Self { door: peripherals.GPIO2 }
    }
}
