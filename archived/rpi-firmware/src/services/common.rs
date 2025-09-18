use serde::{Deserialize, Serialize};

// Domain types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub tag_name: String,
    pub member_name: String,
    pub code: String,
}

// Events for internal communication
#[derive(Debug)]
pub enum AppEvent {
    Connected,
    TagScanned(String),
    TagsUpdated(Vec<Tag>),
    OpenDoor,
    DoorOpened,
    SetLatch(bool),
}
