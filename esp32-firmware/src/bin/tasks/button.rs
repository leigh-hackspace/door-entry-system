use crate::services::common::{MainPublisher, SystemMessage};
use embassy_time::{Duration, Timer};
use esp_hal::{gpio, peripherals::Peripherals};

#[embassy_executor::task]
pub async fn button_task(publisher: MainPublisher) {
    let peripherals = unsafe { Peripherals::steal() };

    let door = gpio::Input::new(peripherals.GPIO21, gpio::Pull::Up);

    loop {
        Timer::after(Duration::from_millis(100)).await;

        if door.is_low() {
            publisher.publish(SystemMessage::ButtonPressed).await;

            Timer::after(Duration::from_millis(5_000)).await;
        }
    }
}
