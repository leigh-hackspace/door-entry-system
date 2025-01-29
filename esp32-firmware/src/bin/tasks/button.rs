use crate::services::common::{MainPublisher, SystemMessage};
use embassy_time::{Duration, Timer};
use esp_hal::{gpio, peripherals::Peripherals};
use log::info;

const DEBOUNCE_WAIT_MS: u64 = 10;
const SHORT_PRESS_DELAY_MS: u64 = 200;
const LONG_PRESS_DELAY_MS: u64 = 3_000;

#[embassy_executor::task]
pub async fn button_task(publisher: MainPublisher) {
    let peripherals = unsafe { Peripherals::steal() };

    let mut door = gpio::Input::new(peripherals.GPIO21, gpio::Pull::Up);

    loop {
        door.wait_for_falling_edge().await;

        let down_time = esp_hal::time::now().ticks();

        // Eliminate noise by delaying
        Timer::after(Duration::from_millis(DEBOUNCE_WAIT_MS)).await;

        // Button still low, wait for it to rise...
        if door.is_low() {
            door.wait_for_rising_edge().await;
        }

        let up_time = esp_hal::time::now().ticks();

        // Found out how long it was down for...
        let delay_ms = (up_time - down_time) / 1_000;

        info!("Button Delay: {} ms", delay_ms);

        if delay_ms > LONG_PRESS_DELAY_MS {
            publisher.publish(SystemMessage::ButtonLongPressed).await;
        } else if delay_ms > SHORT_PRESS_DELAY_MS {
            publisher.publish(SystemMessage::ButtonPressed).await;
        }

        Timer::after(Duration::from_millis(1_000)).await;
    }
}
