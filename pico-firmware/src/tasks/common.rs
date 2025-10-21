use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};

#[derive(Debug)]
pub enum EthernetSignalMessage {
    Connected,
}

pub type EthernetSignal = Signal<CriticalSectionRawMutex, EthernetSignalMessage>;
