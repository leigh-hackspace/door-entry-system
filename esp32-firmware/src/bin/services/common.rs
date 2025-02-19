use alloc::string::String;
use embassy_sync::{
    blocking_mutex::raw::CriticalSectionRawMutex,
    pubsub::{PubSubChannel, Publisher, Subscriber},
};
use serde::{Deserialize, Serialize};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const NOTIFY_URL: &str = env!("NOTIFY_URL");

#[derive(Clone, Debug, PartialEq)]
pub enum SystemMessage {
    WifiOff,
    Ping,
    OtaStarting,
    OtaComplete,
    HandleLatchFromServer(bool),
    PlayFile(String),
}

const CAP: usize = 4;
const SUBS: usize = 1;
const PUBS: usize = 1;

pub type MainChannel = PubSubChannel<CriticalSectionRawMutex, SystemMessage, CAP, SUBS, PUBS>;

pub type MainPublisher = Publisher<'static, CriticalSectionRawMutex, SystemMessage, CAP, SUBS, PUBS>;

pub type MainSubscriber = Subscriber<'static, CriticalSectionRawMutex, SystemMessage, CAP, SUBS, PUBS>;

pub const DEVICE_CONFIG_FILE_NAME: &str = "config.txt";
pub const DEVICE_STATE_FILE_NAME: &str = "state.txt";

#[derive(Serialize, Deserialize, Debug)]
pub struct DeviceInfo {
    pub version: heapless::String<16>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DeviceConfig {
    pub name: heapless::String<16>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DeviceState {
    pub latch: bool,
}
