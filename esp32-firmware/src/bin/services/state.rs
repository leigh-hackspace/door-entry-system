use crate::utils::local_fs::LocalFs;
use alloc::{
    format,
    string::{String, ToString},
    sync::Arc,
};
use core::cell::RefCell;
use esp_storage::FlashStorage;
use log::info;
use serde::{Deserialize, Serialize};

const FILE_NAME: &str = "state.txt";

#[derive(Serialize, Deserialize, Debug)]
struct PermanentState {
    latch: bool,
}

#[derive(Clone)]
pub struct PermanentStateService {
    state: Arc<RefCell<PermanentState>>,
}

impl PermanentStateService {
    pub fn new() -> PermanentStateService {
        PermanentStateService {
            state: Arc::new(RefCell::new(PermanentState { latch: false })),
        }
    }

    pub fn read_json(&self) -> String {
        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        local_fs.read_text_file(FILE_NAME).unwrap_or(r#"{"latch":false}"#.to_string())
    }

    pub fn init(&mut self) -> Result<(), StateError> {
        let json = self.read_json();

        info!("PermanentStateService: init {}", json);

        *self.state.borrow_mut() = serde_json_core::from_str::<PermanentState>(&json)
            .map_err(|err| StateError::Error(format!("{err:?}")))?
            .0;

        Ok(())
    }

    pub fn save(&self) -> Result<(), StateError> {
        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        let json =
            serde_json_core::to_string::<PermanentState, 128>(&self.state.borrow()).map_err(|err| StateError::Error(format!("{err:?}")))?;

        info!("PermanentStateService: save {}", json);

        local_fs
            .write_text_file(FILE_NAME, &json)
            .map_err(|err| StateError::Error(format!("{err:?}")))?;

        Ok(())
    }

    pub fn get_latch(&self) -> bool {
        self.state.borrow_mut().latch
    }

    pub fn set_latch(&mut self, latch: bool) {
        self.state.borrow_mut().latch = latch;
    }

    pub fn toggle_latch(&mut self) -> bool {
        let latch = self.state.borrow().latch;
        self.state.borrow_mut().latch = !latch;
        !latch
    }
}

#[derive(Debug)]
pub enum StateError {
    Error(String),
}
