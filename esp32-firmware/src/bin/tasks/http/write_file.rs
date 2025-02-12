use core::future::{join, IntoFuture};

use crate::{
    services::common::{MainPublisher, SystemMessage},
    utils::local_fs::LocalFs,
};
use alloc::{format, sync::Arc};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use esp_println::print;
use esp_storage::FlashStorage;
use fatfs::Write as _;
use log::info;
use picoserve::{
    io::Read,
    request::RequestBodyReader,
    response::{
        chunked::{ChunkWriter, ChunkedResponse, Chunks, ChunksWritten},
        IntoResponse,
    },
};

pub struct HandleFileWrite {
    pub publisher: &'static Arc<MainPublisher>,
}

impl picoserve::routing::RequestHandlerService<()> for HandleFileWrite {
    async fn call_request_handler_service<R: Read, W: picoserve::response::ResponseWriter<Error = R::Error>>(
        &self,
        (): &(),
        (): (),
        mut request: picoserve::request::Request<'_, R>,
        response_writer: W,
    ) -> Result<picoserve::ResponseSent, W::Error> {
        let query = request.parts.query().unwrap().try_into_string::<50>().unwrap();

        let file_name = query.replace("file=", "");

        info!("Write file: {}", file_name);

        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        let mut file = {
            match local_fs.create_file(&file_name) {
                Ok(file) => file,
                Err(err) => {
                    return format!("Create Error: {err:?}")
                        .write_to(request.body_connection.finalize().await?, response_writer)
                        .await;
                }
            }
        };

        let mut reader = request.body_connection.body().reader();
        let mut buffer = [0; esp_storage::FlashStorage::SECTOR_SIZE as usize];
        let mut total_size = 0;

        // let progress_signal = Signal::<CriticalSectionRawMutex, usize>::new();

        loop {
            let mut read_size = 0;

            // Make sure the buffer is full
            loop {
                let chunk_read_bytes = reader.read(&mut buffer[read_size..]).await.unwrap();
                read_size += chunk_read_bytes;
                if chunk_read_bytes == 0 {
                    break;
                }
            }

            if read_size == 0 {
                // progress_signal.signal(usize::MAX);
                break;
            }

            if let Err(err) = file.write_all(&buffer[0..read_size]) {
                return format!("Write Error: {err}")
                    .write_to(request.body_connection.finalize().await?, response_writer)
                    .await;
            }

            print!("W");

            total_size += read_size;

            self.publisher.publish_immediate(SystemMessage::Ping);
            // progress_signal.signal(total_size);

            // response_writer.write_response(connection, response)
        }

        if let Err(err) = file.truncate() {
            return format!("Truncate Error: {err}")
                .write_to(request.body_connection.finalize().await?, response_writer)
                .await;
        }

        if let Err(err) = file.flush() {
            return format!("Flush Error: {err}")
                .write_to(request.body_connection.finalize().await?, response_writer)
                .await;
        }

        let connection = request.body_connection.finalize().await?;

        format!("Total Size: {total_size}\r\n").write_to(connection, response_writer).await

        // ChunkedResponse::new(ProgressChunks { progress_signal })
        //     .into_response()
        //     .write_to(connection, response_writer)
        //     .await
    }
}

struct ProgressChunks {
    progress_signal: Signal<CriticalSectionRawMutex, usize>,
}

impl Chunks for ProgressChunks {
    fn content_type(&self) -> &'static str {
        "text/plain"
    }

    async fn write_chunks<W: picoserve::io::Write>(self, mut chunk_writer: ChunkWriter<W>) -> Result<ChunksWritten, W::Error> {
        loop {
            let progress = self.progress_signal.wait().await;

            if progress == usize::MAX {
                break;
            }

            writeln!(chunk_writer, "Received: {progress} bytes")
                .await
                .expect("Error writing progress!");
        }

        writeln!(chunk_writer, "Done!").await.expect("Error writing progress done!");

        chunk_writer.finalize().await
    }
}
