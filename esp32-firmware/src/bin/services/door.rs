use esp_hal::{gpio, peripherals::Peripherals};
use log::info;

pub struct DoorService<'a> {
    latch: bool,
    door: gpio::Output<'a>,
    door2: gpio::Output<'a>,
}

impl<'a> DoorService<'a> {
    pub fn new() -> DoorService<'a> {
        let peripherals = unsafe { Peripherals::steal() };

        // On my dev board I blew up GPIO19 so we use GPIO3 as well...
        let door = gpio::Output::new(peripherals.GPIO19, gpio::Level::High);
        let door2 = gpio::Output::new(peripherals.GPIO23, gpio::Level::High);

        DoorService { latch: false, door, door2 }
    }

    pub fn release_door_lock(&mut self) {
        if !self.latch {
            info!("==== LOW ====");
            self.door.set_low();
            self.door2.set_low();
        }
    }

    pub fn set_door_lock(&mut self) {
        if !self.latch {
            info!("==== HIGH ====");
            self.door.set_high();
            self.door2.set_high();
        }
    }

    pub fn set_latch(&mut self, latch: bool) {
        self.latch = latch;

        if latch {
            info!("==== LOW ====");
            self.door.set_low();
            self.door2.set_low();
        } else {
            info!("==== HIGH ====");
            self.door.set_high();
            self.door2.set_high();
        }
    }
}
