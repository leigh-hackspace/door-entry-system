use defmt::*;
use embassy_rp::{
    Peri,
    gpio::{Input, Pull},
    peripherals::PIN_14,
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Instant, Timer};

const DEBOUNCE_WAIT_MS: u64 = 20;
const SHORT_PRESS_DELAY_MS: u64 = 100;
const LONG_PRESS_DELAY_MS: u64 = 3_000;

#[derive(PartialEq, Debug)]
pub enum ButtonSignalMessage {
    ButtonPressed,
    ButtonLongPressed,
}

pub type ButtonSignal = Signal<CriticalSectionRawMutex, ButtonSignalMessage>;

#[embassy_executor::task]
pub async fn button_task(signal: &'static ButtonSignal, pin: Peri<'static, PIN_14>) {
    let mut button = Input::new(pin, Pull::Up);

    'check_down: loop {
        button.wait_for_falling_edge().await;

        let down_time = Instant::now().as_micros();

        loop {
            // Eliminate noise by delaying
            Timer::after(Duration::from_millis(DEBOUNCE_WAIT_MS)).await;

            // Check button is released
            if button.is_high() {
                break;
            }

            let now = Instant::now().as_micros();

            let delay_ms = (now - down_time) / 1_000;

            // We don't wait for release with the long press
            if delay_ms > LONG_PRESS_DELAY_MS {
                signal.signal(ButtonSignalMessage::ButtonLongPressed);
                // Wait for the user to release the button
                button.wait_for_rising_edge().await;
                // Debounce
                Timer::after(Duration::from_millis(DEBOUNCE_WAIT_MS)).await;
                continue 'check_down;
            }
        }

        let up_time = Instant::now().as_micros();

        // Found out how long it was down for...
        let delay_ms = (up_time - down_time) / 1_000;

        info!("Button Delay: {} ms", delay_ms);

        if delay_ms > SHORT_PRESS_DELAY_MS {
            signal.signal(ButtonSignalMessage::ButtonPressed);
        }

        Timer::after(Duration::from_millis(1_000)).await;
    }
}
