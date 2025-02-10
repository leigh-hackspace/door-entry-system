use crate::{
    services::common::{MainPublisher, SystemMessage},
    utils::ButtonPins,
};
use embassy_time::{Duration, Timer};
use esp_hal::gpio;
use log::info;

const DEBOUNCE_WAIT_MS: u64 = 20;
const SHORT_PRESS_DELAY_MS: u64 = 200;
const LONG_PRESS_DELAY_MS: u64 = 3_000;

#[embassy_executor::task]
pub async fn button_task(publisher: MainPublisher) {
    let mut door = gpio::Input::new(ButtonPins::new().button, gpio::InputConfig::default().with_pull(gpio::Pull::Up));

    'check_down: loop {
        door.wait_for_falling_edge().await;

        let down_time = esp_hal::time::Instant::now().duration_since_epoch().as_micros();

        loop {
            // Eliminate noise by delaying
            Timer::after(Duration::from_millis(DEBOUNCE_WAIT_MS)).await;

            // Check button is released
            if door.is_high() {
                break;
            }

            let now = esp_hal::time::Instant::now().duration_since_epoch().as_micros();

            let delay_ms = (now - down_time) / 1_000;

            // We don't wait for release with the long press
            if delay_ms > LONG_PRESS_DELAY_MS {
                publisher.publish(SystemMessage::ButtonLongPressed).await;
                // Wait for the user to release the button
                door.wait_for_rising_edge().await;
                // Debounce
                Timer::after(Duration::from_millis(DEBOUNCE_WAIT_MS)).await;
                continue 'check_down;
            }
        }

        let up_time = esp_hal::time::Instant::now().duration_since_epoch().as_micros();

        // Found out how long it was down for...
        let delay_ms = (up_time - down_time) / 1_000;

        info!("Button Delay: {} ms", delay_ms);

        if delay_ms > SHORT_PRESS_DELAY_MS {
            publisher.publish(SystemMessage::ButtonPressed).await;
        }

        Timer::after(Duration::from_millis(1_000)).await;
    }
}
