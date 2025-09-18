use crate::utils::{common::SharedFs, flash_stream::FlashStream};
use alloc::borrow::ToOwned;
use alloc::{string::String, vec::Vec};
use core::sync::atomic::{AtomicU32, Ordering};
use defmt::*;
use embassy_sync::channel::{Channel, Sender};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, channel::Receiver, rwlock::RwLock};
use fatfs::{File, LossyOemCpConverter, NullTimeProvider, Read, Write};

pub enum FileCommand {
    StartWriting { file_name: String, length: u32 },
    WriteChunk(Vec<u8>),

    StartReading { file_name: String },
}

pub enum FileMessage {
    ChunkWritten,

    StartedReading { file_name: String, length: u32 },
    ReadChunk(Vec<u8>),
}

pub type FileCommandChannel = Channel<CriticalSectionRawMutex, FileCommand, 1>;
pub type FileCommandReceiver = Receiver<'static, CriticalSectionRawMutex, FileCommand, 1>;

pub type FileMessageChannel = Channel<CriticalSectionRawMutex, FileMessage, 1>;
pub type FileCommandSender = Sender<'static, CriticalSectionRawMutex, FileMessage, 1>;

#[embassy_executor::task]
pub async fn file_task(receiver: FileCommandReceiver, sender: FileCommandSender, shared_fs: SharedFs) -> ! {
    'wait_for_start: loop {
        match receiver.receive().await {
            FileCommand::StartWriting { file_name, length } => {
                let local_fs = shared_fs.read().await;
                let mut bytes_remaining = 0u32;

                let mut file = match local_fs.create_file(&file_name) {
                    Ok(file) => {
                        info!("File created: {}", file_name.as_str());
                        bytes_remaining = length;
                        sender.send(FileMessage::ChunkWritten).await;
                        file
                    }
                    Err(err) => {
                        error!("Write Error: {}", defmt::Debug2Format(&err));
                        continue 'wait_for_start;
                    }
                };

                loop {
                    if let FileCommand::WriteChunk(chunk) = receiver.receive().await {
                        if let Err(err) = critical_section::with(|_| file.write_all(&chunk)) {
                            error!("Write Error: {}", defmt::Debug2Format(&err));
                            continue 'wait_for_start;
                        }

                        info!("Wrote {}", chunk.len());
                        bytes_remaining -= chunk.len() as u32;

                        let complete = bytes_remaining == 0;

                        if complete {
                            if let Err(err) = file.truncate() {
                                error!("Truncate Error: {}", defmt::Debug2Format(&err));
                                continue 'wait_for_start;
                            }

                            if let Err(err) = file.flush() {
                                error!("Flush Error: {}", defmt::Debug2Format(&err));
                                continue 'wait_for_start;
                            }

                            info!("Finished Write");
                            continue 'wait_for_start;
                        } else {
                            sender.send(FileMessage::ChunkWritten).await;
                        }
                    }
                }
            }
            FileCommand::StartReading { file_name } => {
                let local_fs = shared_fs.read().await;

                let file_size = match local_fs.get_file_size(&file_name) {
                    Ok(file) => file,
                    Err(err) => {
                        error!("Read File Size Error: {}", defmt::Debug2Format(&err));
                        continue 'wait_for_start;
                    }
                };

                sender
                    .send(FileMessage::StartedReading {
                        file_name: file_name.clone(),
                        length: file_size as u32,
                    })
                    .await;

                let mut file = match local_fs.open_file(&file_name.clone()) {
                    Ok(file) => file,
                    Err(err) => {
                        error!("Open Error: {}", defmt::Debug2Format(&err));
                        continue 'wait_for_start;
                    }
                };

                let mut buffer = [0; 4096];
                let mut total_size = 0;

                loop {
                    let read_size = match file.read(&mut buffer) {
                        Ok(read_size) => {
                            info!("Read {} bytes", read_size);
                            read_size
                        }
                        Err(err) => {
                            error!("Read Error: {}", defmt::Debug2Format(&err));
                            continue 'wait_for_start;
                        }
                    };

                    if read_size == 0 {
                        info!("Finished Read");
                        continue 'wait_for_start;
                    }

                    total_size += read_size;

                    sender.send(FileMessage::ReadChunk(buffer[0..read_size].to_vec())).await;
                }
            }
            _ => {
                error!("Invalid");
            }
        }
    }
}

// pub struct FileWriter<'a> {
//     file: RwLock<CriticalSectionRawMutex, Option<File<'a, FlashStream, NullTimeProvider, LossyOemCpConverter>>>,
//     bytes_remaining: AtomicU32,
// }

// impl<'a> FileWriter<'a> {
//     pub fn new() -> Self {
//         Self {
//             file: RwLock::new(None),
//             bytes_remaining: AtomicU32::new(0),
//         }
//     }

//     pub async fn start(&mut self, file: File<'a, FlashStream, NullTimeProvider, LossyOemCpConverter>, length: u32) {
//         info!("Starting, size {}", length);

//         *(self.file.write().await) = Some(file);
//         self.bytes_remaining.store(length, Ordering::Relaxed);
//     }

//     pub async fn append_chunk(&mut self, data: Vec<u8>) -> bool {
//         if data.len() as u32 > self.bytes_remaining.load(Ordering::Relaxed) {
//             error!("Too many bytes: {} > {}", data.len(), self.bytes_remaining.load(Ordering::Relaxed));
//             return true;
//         }

//         let mut file = self.file.write().await;

//         match file.as_mut() {
//             Some(file) => {
//                 if let Err(err) = file.write_all(&data) {
//                     error!("Write Error: {}", defmt::Debug2Format(&err));
//                     return true;
//                 }

//                 if let Err(err) = file.truncate() {
//                     error!("Truncate Error: {}", defmt::Debug2Format(&err));
//                     return true;
//                 }

//                 if let Err(err) = file.flush() {
//                     error!("Flush Error: {}", defmt::Debug2Format(&err));
//                     return true;
//                 }

//                 self.bytes_remaining.fetch_sub(data.len() as u32, Ordering::Relaxed);
//                 info!("Wrote {}", data.len());

//                 if self.bytes_remaining.load(Ordering::Relaxed) == 0 {
//                     info!("Complete!");

//                     *(self.file.write().await) = None;

//                     return true;
//                 }
//             }
//             None => {
//                 error!("No file!");
//                 return true;
//             }
//         }

//         return false; // Still more to do...
//     }
// }
