use alloc::string::{String, ToString};
use defmt::*;
use embassy_rp::{
    Peri,
    gpio::{Level, Output},
    peripherals::PIN_15,
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::Timer;

#[derive(PartialEq, Debug)]
pub enum DoorSignalMessage {
    Open(u32),
    Latch(bool),
}

pub type DoorSignal = Signal<CriticalSectionRawMutex, DoorSignalMessage>;

#[embassy_executor::task]
pub async fn door_task(signal: &'static DoorSignal, pin: Peri<'static, PIN_15>) {
    let mut door = Output::new(pin, Level::High);
    let mut latched = false;

    loop {
        match signal.wait().await {
            DoorSignalMessage::Open(secs) => {
                if !latched {
                    door.set_low();
                    Timer::after_secs(secs as u64).await;
                    door.set_high();
                }
            }
            DoorSignalMessage::Latch(latch) => {
                latched = latch;

                if latch {
                    door.set_low();
                } else {
                    door.set_high();
                }
            }
        }
    }
}
