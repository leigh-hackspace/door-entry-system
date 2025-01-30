use crate::utils::local_fs::LocalFs;
use alloc::{format, string::String, sync::Arc};
use core::cell::{RefCell, RefMut};
use esp_storage::FlashStorage;
use log::{info, warn};
use serde::{de::DeserializeOwned, Serialize};

const MAX_LENGTH: usize = 128;

pub struct PermanentStateService<State> {
    file_name: String,
    state: Arc<RefCell<State>>,
}

impl<State> Clone for PermanentStateService<State> {
    fn clone(&self) -> Self {
        Self {
            file_name: self.file_name.clone(),
            state: Arc::clone(&self.state),
        }
    }
}

impl<State: DeserializeOwned + Serialize> PermanentStateService<State> {
    pub fn new(file_name: String, initial: State) -> PermanentStateService<State> {
        PermanentStateService {
            file_name,
            state: Arc::new(RefCell::new(initial)),
        }
    }

    fn read_json(&self) -> Option<String> {
        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        match local_fs.read_text_file(&self.file_name) {
            Ok(json) => Some(json),
            Err(_) => {
                warn!("Unable to read json");
                None
            }
        }
    }

    pub fn init(&mut self) -> Result<(), StateError> {
        let json = self.read_json();

        match json {
            Some(json) => {
                info!("PermanentStateService: init {}", json);

                *self.state.borrow_mut() = serde_json_core::from_str::<State>(&json)
                    .map_err(|err| StateError::Error(format!("{err:?}")))?
                    .0;

                Ok(())
            }
            None => Ok(()),
        }
    }

    pub fn get_json(&self) -> Result<heapless::String<MAX_LENGTH>, StateError> {
        serde_json_core::to_string::<State, MAX_LENGTH>(&self.state.borrow()).map_err(|err| StateError::Error(format!("{err:?}")))
    }

    pub fn save(&self) -> Result<(), StateError> {
        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        let json = self.get_json()?;

        info!("PermanentStateService: save {}", json);

        local_fs
            .write_text_file(&self.file_name, &json)
            .map_err(|err| StateError::Error(format!("{err:?}")))?;

        Ok(())
    }

    pub fn get_data(&self) -> RefMut<'_, State> {
        self.state.borrow_mut()
    }
}

#[derive(Debug)]
pub enum StateError {
    Error(String),
}
