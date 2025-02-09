use crate::utils::local_fs::LocalFs;
use alloc::{format, string::String};
use embedded_io_async::Read;
use esp_println::print;
use esp_storage::FlashStorage;
use fatfs::Read as _;
use log::info;
use picoserve::response::{
    chunked::{ChunkWriter, ChunkedResponse, Chunks, ChunksWritten},
    IntoResponse,
};

pub struct HandleFileRead;

impl picoserve::routing::RequestHandlerService<()> for HandleFileRead {
    async fn call_request_handler_service<R: Read, W: picoserve::response::ResponseWriter<Error = R::Error>>(
        &self,
        (): &(),
        (): (),
        request: picoserve::request::Request<'_, R>,
        response_writer: W,
    ) -> Result<picoserve::ResponseSent, W::Error> {
        let query = request.parts.query().unwrap().try_into_string::<50>().unwrap();

        let file_name = query.replace("file=", "");

        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        let file_size = {
            match local_fs.get_file_size(&file_name) {
                Ok(file) => file,
                Err(err) => {
                    return format!("Read File Size Error: {err:?}")
                        .write_to(request.body_connection.finalize().await?, response_writer)
                        .await;
                }
            }
        };

        info!("Read file: {} {}", file_name, file_size);

        let connection = request.body_connection.finalize().await?;

        ChunkedResponse::new(TextChunks { file_name })
            .into_response()
            .with_header("Content-Length", file_size)
            .write_to(connection, response_writer)
            .await
    }
}

struct TextChunks {
    file_name: String,
}

impl Chunks for TextChunks {
    fn content_type(&self) -> &'static str {
        if self.file_name.to_lowercase().ends_with(".txt") {
            "text/plain"
        } else {
            "binary/octet-stream"
        }
    }

    async fn write_chunks<W: picoserve::io::Write>(self, mut chunk_writer: ChunkWriter<W>) -> Result<ChunksWritten, W::Error> {
        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        let mut file = {
            match local_fs.open_file(&self.file_name) {
                Ok(file) => file,
                Err(err) => {
                    write!(chunk_writer, "Open Error: {err:?}").await.expect("Error writing error!");
                    return chunk_writer.finalize().await;
                }
            }
        };

        let mut buffer = [0; 128];
        let mut total_size = 0;

        loop {
            let read_size = {
                match file.read(&mut buffer) {
                    Ok(file) => file,
                    Err(err) => {
                        write!(chunk_writer, "Read Error: {err:?}").await.expect("Error writing error!");
                        return chunk_writer.finalize().await;
                    }
                }
            };
            if read_size == 0 {
                break;
            }

            chunk_writer.write_chunk(&buffer[0..read_size]).await?;
            print!(".");

            total_size += read_size;
        }

        chunk_writer.finalize().await
    }
}
