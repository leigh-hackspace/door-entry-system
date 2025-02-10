use alloc::string::{String, ToString};
use esp_hal::{
    dma::DmaChannel0,
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

// pub struct I2sPins {
//     pub bclk: GpioPin<15>,
//     pub ws: GpioPin<18>,
//     pub dout: GpioPin<14>,
//     pub i2s: I2S0,
//     pub dma: DmaChannel0,
// }

// impl I2sPins {
//     pub fn new() -> Self {
//         let peripherals = unsafe { Peripherals::steal() };

//         Self {
//             bclk: peripherals.GPIO15,
//             ws: peripherals.GPIO18,
//             dout: peripherals.GPIO14,
//             i2s: peripherals.I2S0,
//             dma: peripherals.DMA_CH0,
//         }
//     }
// }

// pub struct RfidPins {
//     pub sclk: GpioPin<20>,
//     pub miso: GpioPin<21>,
//     pub mosi: GpioPin<22>,
//     pub cs: GpioPin<19>,
//     pub spi: SPI2,
// }

// impl RfidPins {
//     pub fn new() -> Self {
//         let peripherals = unsafe { Peripherals::steal() };

//         Self {
//             sclk: peripherals.GPIO20,
//             miso: peripherals.GPIO21,
//             mosi: peripherals.GPIO22,
//             cs: peripherals.GPIO19,
//             spi: peripherals.SPI2,
//         }
//     }
// }

pub struct I2sPins {
    pub bclk: GpioPin<19>,
    pub ws: GpioPin<18>,
    pub dout: GpioPin<20>,
    pub i2s: I2S0,
    pub dma: DmaChannel0,
}

impl I2sPins {
    pub fn new() -> Self {
        let peripherals = unsafe { Peripherals::steal() };

        Self {
            bclk: peripherals.GPIO19,
            ws: peripherals.GPIO18,
            dout: peripherals.GPIO20,
            i2s: peripherals.I2S0,
            dma: peripherals.DMA_CH0,
        }
    }
}

pub struct RfidPins {
    pub sclk: GpioPin<14>,
    pub miso: GpioPin<8>,
    pub mosi: GpioPin<9>,
    pub cs: GpioPin<15>,
    pub spi: SPI2,
}

impl RfidPins {
    pub fn new() -> Self {
        let peripherals = unsafe { Peripherals::steal() };

        Self {
            sclk: peripherals.GPIO14,
            miso: peripherals.GPIO8,
            mosi: peripherals.GPIO9,
            cs: peripherals.GPIO15,
            spi: peripherals.SPI2,
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
