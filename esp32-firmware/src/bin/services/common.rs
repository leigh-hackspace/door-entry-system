use alloc::string::String;
use embassy_sync::{
    blocking_mutex::raw::CriticalSectionRawMutex,
    pubsub::{PubSubChannel, Publisher, Subscriber},
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq)]
pub enum SystemMessage {
    CodeDetected(String),
    Authorised,
    Denied,
    ButtonPressed,
    ButtonLongPressed,
    WifiOff,
    Watchdog,
    Ping,
    OtaStarting,
    SetLatch(bool),
}

const CAP: usize = 4;
const SUBS: usize = 1;
const PUBS: usize = 6;

pub type MainChannel = PubSubChannel<CriticalSectionRawMutex, SystemMessage, CAP, SUBS, PUBS>;

pub type MainPublisher = Publisher<'static, CriticalSectionRawMutex, SystemMessage, CAP, SUBS, PUBS>;

pub type MainSubscriber = Subscriber<'static, CriticalSectionRawMutex, SystemMessage, CAP, SUBS, PUBS>;

pub const DEVICE_CONFIG_FILE_NAME: &str = "config.txt";
pub const DEVICE_STATE_FILE_NAME: &str = "state.txt";

#[derive(Serialize, Deserialize, Debug)]
pub struct DeviceConfig {
    pub name: heapless::String<16>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DeviceState {
    pub latch: bool,
}
