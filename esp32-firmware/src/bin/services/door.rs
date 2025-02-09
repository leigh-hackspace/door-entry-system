use esp_hal::{gpio, peripherals::Peripherals};
use log::info;

use crate::utils::DoorPins;

pub struct DoorService<'a> {
    latch: bool,
    door: gpio::Output<'a>,
}

impl<'a> DoorService<'a> {
    pub fn new() -> DoorService<'a> {
        let door = gpio::Output::new(DoorPins::new().door, gpio::Level::High);

        DoorService { latch: false, door }
    }

    pub fn release_door_lock(&mut self) {
        if !self.latch {
            info!("==== LOW ====");
            self.door.set_low();
        }
    }

    pub fn set_door_lock(&mut self) {
        if !self.latch {
            info!("==== HIGH ====");
            self.door.set_high();
        }
    }

    pub fn set_latch(&mut self, latch: bool) {
        self.latch = latch;

        if latch {
            info!("==== LOW ====");
            self.door.set_low();
        } else {
            info!("==== HIGH ====");
            self.door.set_high();
        }
    }
}
