use super::flash_stream::FlashStream;
use alloc::{
    format,
    string::{String, ToString},
    vec::Vec,
};
use core::str::{self, from_utf8};
use esp_storage::FlashStorage;
use fatfs::{format_volume, FileSystem, FormatVolumeOptions, FsOptions, LossyOemCpConverter, NullTimeProvider, Read, Write};
use log::error;
use partitions_macro::{partition_offset, partition_size};
use serde::Serialize;

const FS_OFFSET: u64 = partition_offset!("storage") as u64;
const FS_LENGTH: u64 = partition_size!("storage") as u64;

pub struct LocalFs<'a> {
    fs: FileSystem<FlashStream<'a>>, // FileSystem using FlashStream
}

#[derive(Serialize, Debug)]
pub struct FileEntry {
    name: heapless::String<11>,
    size: u64,
}

impl<'a> LocalFs<'a> {
    pub fn make_new_filesystem() {
        let mut flash = FlashStorage::new();
        let mut flash_stream = FlashStream::new(&mut flash, FS_OFFSET, FS_LENGTH);
        format_volume(&mut flash_stream, FormatVolumeOptions::new()).unwrap();
    }

    pub fn new(flash: &'a mut FlashStorage) -> Self {
        let flash_stream = FlashStream::new(flash, FS_OFFSET, FS_LENGTH);

        let fs = match FileSystem::new(flash_stream, FsOptions::new()) {
            Ok(fs) => fs,
            Err(err) => {
                error!("LocalFs.new: {:?}", err);

                match err {
                    fatfs::Error::CorruptedFileSystem => {
                        LocalFs::make_new_filesystem();
                        panic!("New File System Created! Rebooting...");
                    }
                    _ => todo!(),
                }
            }
        };

        LocalFs { fs }
    }

    pub fn dir(&self) -> Result<Vec<FileEntry>, FsError> {
        let root_dir = self.fs.root_dir();

        let mut entries = Vec::<FileEntry>::new();

        for file in root_dir.iter() {
            let file = file.map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

            let name: heapless::String<11> = file
                .file_name()
                .as_str()
                .try_into()
                .map_err(|err| FsError::OpenError(format!("{:?}", err)))?;

            let size = file.len();

            let entry = FileEntry { name, size };

            entries.push(entry);
        }

        Ok(entries)
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
