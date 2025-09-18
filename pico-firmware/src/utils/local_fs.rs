use super::flash_stream::FlashStream;
use crate::utils::common::Flash;
use alloc::{
    format,
    string::{String, ToString},
    vec::Vec,
};
use core::str::{self, from_utf8};
use defmt::*;
use embassy_rp::{flash::Async, peripherals::FLASH};
use fatfs::{FileSystem, FileSystemStats, FormatVolumeOptions, FsOptions, LossyOemCpConverter, NullTimeProvider, Read, Write, format_volume};
use serde::{Deserialize, Serialize};

const FS_OFFSET: u64 = 0x300_000;
const FS_LENGTH: u64 = 0x100_000;

pub struct LocalFs {
    fs: FileSystem<FlashStream>, // FileSystem using FlashStream
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FileEntry {
    name: String,
    size: u64,
}

impl LocalFs {
    pub fn make_new_filesystem(flash: Flash) {
        let mut flash_stream = FlashStream::new(flash, FS_OFFSET, FS_LENGTH);
        format_volume(&mut flash_stream, FormatVolumeOptions::new()).unwrap();
    }

    pub fn new(flash: Flash) -> Result<Self, bool> {
        info!("LocalFs.new: {:?} {:?}", FS_OFFSET, FS_LENGTH);

        let flash_stream = FlashStream::new(flash, FS_OFFSET, FS_LENGTH);

        let fs = match FileSystem::new(flash_stream, FsOptions::new()) {
            Ok(fs) => fs,
            Err(err) => {
                error!("LocalFs.new: {:?}", defmt::Debug2Format(&err));

                match err {
                    fatfs::Error::CorruptedFileSystem => {
                        return Err(true);
                    }
                    _ => defmt::panic!("Unknown FS Error: {}", defmt::Debug2Format(&err)),
                }
            }
        };

        Ok(LocalFs { fs })
    }

    pub fn stats(&self) -> Result<FileSystemStats, FsError> {
        self.fs.stats().map_err(|err| FsError::OpenError(format!("{:?}", err)))
    }

    pub fn dir(&self) -> Result<Vec<FileEntry>, FsError> {
        let root_dir = self.fs.root_dir();

        let mut entries = Vec::<FileEntry>::new();

        for file in root_dir.iter() {
            let file = file.map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

            let name: String = file.file_name().as_str().try_into().map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

            let size = file.len();

            let entry = FileEntry { name, size };

            entries.push(entry);
        }

        Ok(entries)
    }

    pub fn get_file_size(&self, file_name: &str) -> Result<u64, FsError> {
        let root_dir = self.fs.root_dir();

        for file in root_dir.iter() {
            let file = file.map_err(|err| FsError::ReadError(format!("{:?}", err)))?;

            if file.file_name().eq_ignore_ascii_case(file_name) {
                return Ok(file.len());
            }
        }

        Err(FsError::OpenError("File not found".to_string()))
    }

    pub fn open_file(&self, file_name: &str) -> Result<fatfs::File<'_, FlashStream, NullTimeProvider, LossyOemCpConverter>, FsError> {
        let root_dir = self.fs.root_dir();

        let file = root_dir.open_file(file_name).map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

        Ok(file)
    }

    pub fn create_file(&self, file_name: &str) -> Result<fatfs::File<'_, FlashStream, NullTimeProvider, LossyOemCpConverter>, FsError> {
        let root_dir = self.fs.root_dir();

        let file = root_dir.create_file(file_name).map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

        Ok(file)
    }

    pub fn delete_file(&self, file_name: &str) -> Result<(), FsError> {
        critical_section::with(|_| {
            let root_dir = self.fs.root_dir();

            root_dir.remove(file_name).map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

            Ok(())
        })
    }

    pub fn read_text_file(&self, file_name: &str) -> Result<String, FsError> {
        let root_dir = self.fs.root_dir();

        let mut buf = [0u8; 128];

        let len = self
            .get_file_size(file_name)
            .map_err(|err| FsError::OpenError("Could not read length".to_string()))?;

        let mut file = root_dir.open_file(file_name).map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

        let read_bytes = file.read(&mut buf).map_err(|err| FsError::ReadError(format!("{:?}", err)))?;

        if len != read_bytes as u64 {
            return Err(FsError::ReadError(format!("Len={} Read={}", len, read_bytes)));
        }

        from_utf8(&buf[0..(len as usize)])
            .map_err(|err| FsError::ReadError(format!("{:?}", err)))
            .map(|res| res.to_string())
    }

    pub fn write_text_file(&self, file_name: &str, content: &str) -> Result<(), FsError> {
        let root_dir = self.fs.root_dir();

        let mut file = root_dir.create_file(file_name).map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

        let buf = content.as_bytes();

        file.write_all(&buf).map_err(|err| FsError::WriteError(format!("{:?}", err)))?;

        file.truncate().map_err(|err| FsError::WriteError(format!("{:?}", err)))?;

        file.flush().map_err(|err| FsError::WriteError(format!("{:?}", err)))?;

        Ok(())
    }
}

#[derive(Debug)]
pub enum FsError {
    OpenError(String),
    ReadError(String),
    WriteError(String),
}
