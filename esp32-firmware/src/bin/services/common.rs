use alloc::string::String;
use embassy_sync::{
    blocking_mutex::raw::CriticalSectionRawMutex,
    pubsub::{PubSubChannel, Publisher, Subscriber},
};

#[derive(Clone, Debug)]
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
