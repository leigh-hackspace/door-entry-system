use crate::services::common::{MainPublisher, SystemMessage};
use embassy_time::{Duration, Timer};
use esp_hal::{gpio, peripherals::Peripherals};

#[embassy_executor::task]
pub async fn button_task(publisher: MainPublisher) {
    let peripherals = unsafe { Peripherals::steal() };

    let mut door = gpio::Input::new(peripherals.GPIO21, gpio::Pull::Up);

    loop {
        door.wait_for_falling_edge().await;

        let down_time = esp_hal::time::now().ticks();

        Timer::after(Duration::from_millis(50)).await;

        if door.is_low() {
            door.wait_for_rising_edge().await;
        }

        let up_time = esp_hal::time::now().ticks();

        if up_time - down_time > 1_000_000 {
            publisher.publish(SystemMessage::ButtonLongPressed).await;
        } else {
            publisher.publish(SystemMessage::ButtonPressed).await;
        }

        Timer::after(Duration::from_millis(1_000)).await;
    }
}
