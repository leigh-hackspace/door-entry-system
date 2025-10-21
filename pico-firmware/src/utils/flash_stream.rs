use alloc::{format, string::String};
use core::fmt;
use defmt::*;
use embassy_rp::{
    flash::{Async, ERASE_SIZE, Flash},
    peripherals::FLASH,
};
use embedded_storage::{ReadStorage, Storage};
use fatfs::{IoBase, IoError};

const FLASH_SIZE: usize = 4 * 1024 * 1024;

#[derive(Debug)]
pub enum FlashStreamError {
    FlashError(String), // General error with message
    UnexpectedEof,
    WriteZero,
    StorageError(String), // For underlying storage errors without full std::Error
}

impl FlashStreamError {
    pub fn from_message(msg: &str) -> Self {
        FlashStreamError::FlashError(msg.into())
    }
}

impl defmt::Format for FlashStreamError {
    fn format(&self, f: defmt::Formatter<'_>) {
        match self {
            FlashStreamError::FlashError(msg) => defmt::write!(f, "Flash error: {}", msg.as_str()),
            FlashStreamError::UnexpectedEof => defmt::write!(f, "Unexpected EOF encountered"),
            FlashStreamError::WriteZero => defmt::write!(f, "Write zero error"),
            FlashStreamError::StorageError(msg) => {
                defmt::write!(f, "Storage error: {}", msg.as_str())
            }
        }
    }
}

impl IoError for FlashStreamError {
    fn is_interrupted(&self) -> bool {
        false
    }

    fn new_unexpected_eof_error() -> Self {
        FlashStreamError::UnexpectedEof
    }

    fn new_write_zero_error() -> Self {
        FlashStreamError::WriteZero
    }
}

pub struct FlashStream {
    pub flash: Flash<'static, FLASH, Async, FLASH_SIZE>,
    offset: u64,
    size: u64,
    pos: u64,
}

impl FlashStream {
    pub fn new(flash: Flash<'static, FLASH, Async, FLASH_SIZE>, offset: u64, size: u64) -> FlashStream {
        FlashStream { flash, offset, size, pos: 0 }
    }

    pub fn write_unaligned(&mut self, offset: u32, bytes: &[u8]) -> Result<(), embassy_rp::flash::Error> {
        critical_section::with(|_| {
            let mut data_offset = offset % ERASE_SIZE as u32;
            let mut aligned_offset = offset - data_offset;
            let mut sector_data = [0u8; ERASE_SIZE];
            let mut remaining_bytes = bytes;

            while !remaining_bytes.is_empty() {
                // Read the current sector data to preserve existing content
                self.flash.blocking_read(aligned_offset, &mut sector_data)?;

                // Calculate how many bytes we can write in this sector
                let bytes_to_write = remaining_bytes.len().min((ERASE_SIZE as u32 - data_offset) as usize);

                // Copy new data into the sector buffer
                sector_data[data_offset as usize..data_offset as usize + bytes_to_write].copy_from_slice(&remaining_bytes[..bytes_to_write]);

                // Erase the sector (check your API - this might need just the size parameter)
                self.flash.blocking_erase(aligned_offset, aligned_offset + ERASE_SIZE as u32)?;

                // Write the modified sector back
                self.flash.blocking_write(aligned_offset, &sector_data)?;

                // Move to next sector
                aligned_offset += ERASE_SIZE as u32;
                data_offset = 0; // After first sector, we're always aligned
                remaining_bytes = &remaining_bytes[bytes_to_write..];
            }

            Ok(())
        })
    }
}

impl IoBase for FlashStream {
    type Error = FlashStreamError;
}

impl fatfs::Seek for FlashStream {
    fn seek(&mut self, pos: fatfs::SeekFrom) -> Result<u64, Self::Error> {
        match pos {
            fatfs::SeekFrom::Start(offset) => self.pos = offset,
            fatfs::SeekFrom::End(offset) => self.pos = ((self.size as i64) + offset) as u64,
            fatfs::SeekFrom::Current(offset) => self.pos = ((self.pos as i64) + offset) as u64,
        };

        Ok(self.pos)
    }
}

impl fatfs::Read for FlashStream {
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, Self::Error> {
        let buf_len = buf.len();

        // info!("READ POS:{} LEN:{}", self.pos, buf_len);

        self.flash
            .blocking_read((self.offset + self.pos) as u32, buf)
            .map_err(|err| FlashStreamError::StorageError(format!("{:?}", err)))?;

        let bytes_read = buf_len.min((self.size - self.pos) as usize);
        self.pos += bytes_read as u64;

        Ok(bytes_read)
    }
}

impl fatfs::Write for FlashStream {
    fn write(&mut self, buf: &[u8]) -> Result<usize, Self::Error> {
        let buf_len = buf.len();

        // info!("WRITE POS:{} LEN:{}", self.pos, buf_len);

        // self.flash
        //     .blocking_write((self.offset + self.pos) as u32, buf)
        //     .map_err(|err| FlashStreamError::StorageError(format!("{:?}", err)))?;

        self.write_unaligned((self.offset + self.pos) as u32, buf)
            .map_err(|err| FlashStreamError::StorageError(format!("{:?}", err)))?;

        let bytes_written = buf_len.min((self.size - self.pos) as usize);
        self.pos += bytes_written as u64;

        Ok(bytes_written)
    }

    fn flush(&mut self) -> Result<(), Self::Error> {
        // No-op in this implementation
        Ok(())
    }
}
