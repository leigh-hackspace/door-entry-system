use crate::services::led::LedService;
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Timer};

#[derive(PartialEq, Debug)]
pub enum LedSignal {
    Set(u8, u8, u8),
    Flash(u8, u8, u8, u8, u16),
}

#[embassy_executor::task]
pub async fn led_task(signal: &'static Signal<CriticalSectionRawMutex, LedSignal>) {
    let mut led_service = LedService::new();

    loop {
        match signal.wait().await {
            LedSignal::Set(r, g, b) => {
                led_service.send(r, g, b).await;
            }
            LedSignal::Flash(r, g, b, count, interval_ms) => {
                for _ in 0..count {
                    led_service.send(r, g, b).await;
                    Timer::after(Duration::from_millis(interval_ms as u64)).await;
                    led_service.send(0, 0, 0).await;
                    Timer::after(Duration::from_millis(interval_ms as u64)).await;
                }
            }
        }
    }
}
