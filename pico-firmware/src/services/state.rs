use crate::utils::{common::SharedFs, local_fs::LocalFs};
use alloc::{format, string::String, sync::Arc};
use core::cell::{RefCell, RefMut};
use defmt::*;
use serde::{Serialize, de::DeserializeOwned};

const MAX_LENGTH: usize = 128;

pub struct PermanentStateService<State> {
    shared_fs: SharedFs,
    file_name: String,
    state: Arc<RefCell<State>>,
}

impl<State> Clone for PermanentStateService<State> {
    fn clone(&self) -> Self {
        Self {
            shared_fs: self.shared_fs.clone(),
            file_name: self.file_name.clone(),
            state: Arc::clone(&self.state),
        }
    }
}

impl<State: DeserializeOwned + Serialize> PermanentStateService<State> {
    pub fn new(shared_fs: SharedFs, file_name: String, initial: State) -> PermanentStateService<State> {
        PermanentStateService {
            shared_fs,
            file_name,
            state: Arc::new(RefCell::new(initial)),
        }
    }

    async fn read_json(&self) -> Option<String> {
        match self.shared_fs.read().await.read_text_file(&self.file_name) {
            Ok(json) => Some(json),
            Err(_) => {
                warn!("Unable to read json");
                None
            }
        }
    }

    pub async fn init(&mut self) -> Result<(), StateError> {
        let json = self.read_json().await;

        match json {
            Some(json) => {
                info!("PermanentStateService: init {}", json.as_str());

                *self.state.borrow_mut() = serde_json::from_str::<State>(&json).map_err(|err| StateError::Error(format!("{err:?}")))?;

                Ok(())
            }
            None => Ok(()),
        }
    }

    pub fn get_json(&self) -> Result<String, StateError> {
        serde_json::to_string::<State>(&self.state.borrow()).map_err(|err| StateError::Error(format!("{err:?}")))
    }

    pub async fn save(&self) -> Result<(), StateError> {
        let json = self.get_json()?;

        info!("PermanentStateService: save {}", json.as_str());

        self.shared_fs
            .read()
            .await
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
