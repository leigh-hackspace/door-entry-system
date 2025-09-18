use crate::utils::local_fs::LocalFs;
use alloc::{
    format,
    string::{String, ToString},
    vec::Vec,
};
use esp_storage::FlashStorage;
use fatfs::Read;

#[derive(Debug)]
pub enum CheckCodeError {
    IoError(String),
}

pub enum CheckCodeResult {
    Valid(String),
    Invalid,
}

pub async fn check_code(code: &str) -> Result<CheckCodeResult, CheckCodeError> {
    let mut flash = FlashStorage::new();
    let local_fs = LocalFs::new(&mut flash);

    /*
    The file that we're opening is ASCII encoded and contains valid codes and names. For example:

    123456 Chris
    654321 Andrew
    987654 Bob
    */

    let mut file = local_fs
        .open_file("codes.txt")
        .map_err(|err| CheckCodeError::IoError(format!("Error opening file: {err:?}")))?;

    let mut buf = [0u8; 128];
    let mut current_line = Vec::new();

    loop {
        let read_length = file
            .read(&mut buf)
            .map_err(|err| CheckCodeError::IoError(format!("Error reading file: {err:?}")))?;

        if read_length == 0 {
            // No more file contents to read
            break;
        }

        for &byte in &buf[..read_length] {
            if byte == b'\n' {
                // Line completed; process the line
                if let Ok(line_str) = String::from_utf8(current_line.clone()) {
                    if line_str.starts_with(code) {
                        // Split the line into code and name
                        if let Some((_, name)) = line_str.split_once(' ') {
                            return Ok(CheckCodeResult::Valid(name.trim().to_string()));
                        }
                    }
                }
                current_line.clear();
            } else {
                // Accumulate bytes into the current line
                current_line.push(byte);
            }
        }
    }

    Ok(CheckCodeResult::Invalid)
}

//3654908809 - Good
//308508919  - Bad
//2741061529 | 490399555 - Near door
