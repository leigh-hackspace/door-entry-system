use embassy_time::{Duration, Timer};
use esp_hal::{gpio, peripherals::Peripherals};
use log::info;

pub struct DoorService<'a> {
    door: gpio::Output<'a>,
}

impl<'a> DoorService<'a> {
    pub fn new() -> DoorService<'a> {
        let peripherals = unsafe { Peripherals::steal() };

        let door = gpio::Output::new(peripherals.GPIO19, gpio::Level::High);

        DoorService { door }
    }

    pub async fn release_door_lock(&mut self) {
        self.door.set_low();
        info!("Door is open!");
        // Timer::after(Duration::from_millis(3000)).await;
        // info!("Door is closed again!");
        // self.door.set_high();
    }

    pub async fn set_door_lock(&mut self) {
        // self.door.set_low();
        // info!("Door is open!");
        // Timer::after(Duration::from_millis(3000)).await;
        info!("Door is closed again!");
        self.door.set_high();
    }
}
