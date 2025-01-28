use super::flash_stream::FlashStream;
use alloc::{
    format,
    string::{String, ToString},
};
use core::str::from_utf8;
use esp_storage::FlashStorage;
use fatfs::{FileSystem, FsOptions, LossyOemCpConverter, NullTimeProvider, Read, Write};
use log::info;

pub struct LocalFs<'a> {
    fs: FileSystem<FlashStream<'a>>, // FileSystem using FlashStream
}

impl<'a> LocalFs<'a> {
    pub fn new(flash: &'a mut FlashStorage) -> Self {
        let flash_stream = FlashStream::new(flash, 0x310000, 0xF0000);

        let fs = FileSystem::new(flash_stream, FsOptions::new()).expect("Failed to create FileSystem");

        info!("FS Type: {:?}", fs.fat_type());

        LocalFs { fs }
    }

    pub fn dir(&self) {
        let root_dir = self.fs.root_dir();

        // let mut buf = [0u8; 128];

        for file in root_dir.iter() {
            let file_name = file.unwrap().file_name();
            info!("File: {}", file_name);

            // let mut contents = root_dir.open_file(file_name.as_str()).unwrap();
            // let read_bytes = contents.read(&mut buf).unwrap();

            // info!("Contents: ({}) {}", read_bytes, from_utf8(&buf).unwrap());
        }
    }

    pub fn get_file_size(&self, file_name: &str) -> Result<u64, FsError> {
        let root_dir = self.fs.root_dir();

        for file in root_dir.iter() {
            let file = file.unwrap();

            if file.file_name().eq_ignore_ascii_case(file_name) {
                return Ok(file.len());
            }
        }

        Err(FsError::OpenError("File not found".to_string()))
    }

    pub fn open_file(&self, file_name: &str) -> Result<fatfs::File<'_, FlashStream<'a>, NullTimeProvider, LossyOemCpConverter>, FsError> {
        let root_dir = self.fs.root_dir();

        let file = root_dir.open_file(file_name).map_err(|err| FsError::OpenError(err.to_string()))?;

        Ok(file)
    }

    pub fn create_file(&self, file_name: &str) -> Result<fatfs::File<'_, FlashStream<'a>, NullTimeProvider, LossyOemCpConverter>, FsError> {
        let root_dir = self.fs.root_dir();

        let file = root_dir.create_file(file_name).map_err(|err| FsError::OpenError(err.to_string()))?;

        Ok(file)
    }

    pub fn delete_file(&self, file_name: &str) -> Result<(), FsError> {
        let root_dir = self.fs.root_dir();

        root_dir.remove(file_name).map_err(|err| FsError::OpenError(err.to_string()))?;

        Ok(())
    }

    pub fn read_text_file(&self, file_name: &str) -> Result<String, FsError> {
        let root_dir = self.fs.root_dir();

        let mut buf = [0u8; 128];

        let len = self
            .get_file_size(file_name)
            .map_err(|err| FsError::OpenError("Could not read length".to_string()))?;

        let mut file = root_dir.open_file(file_name).map_err(|err| FsError::OpenError(err.to_string()))?;

        let read_bytes = file.read(&mut buf).map_err(|err| FsError::ReadError(err.to_string()))?;

        if len != read_bytes as u64 {
            return Err(FsError::ReadError(format!("Len={} Read={}", len, read_bytes)));
        }

        Ok(from_utf8(&buf[0..(len as usize)]).unwrap().to_string())
    }

    pub fn write_text_file(&self, file_name: &str, content: &str) -> Result<(), FsError> {
        let root_dir = self.fs.root_dir();

        let mut file = root_dir.create_file(file_name).map_err(|err| FsError::OpenError(err.to_string()))?;

        let buf = content.as_bytes();

        file.write_all(&buf).map_err(|err| FsError::WriteError(err.to_string()))?;

        file.truncate().map_err(|err| FsError::WriteError(err.to_string()))?;

        file.flush().map_err(|err| FsError::WriteError(err.to_string()))?;

        Ok(())
    }
}

#[derive(Debug)]
pub enum FsError {
    OpenError(String),
    ReadError(String),
    WriteError(String),
}
