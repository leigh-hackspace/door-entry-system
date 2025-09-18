use crate::utils::local_fs::{FileEntry, LocalFs};
use alloc::format;
use embedded_io_async::Read;
use esp_storage::FlashStorage;
use picoserve::response::{
    chunked::{ChunkWriter, ChunkedResponse, Chunks, ChunksWritten},
    IntoResponse,
};

pub struct HandleFileList;

impl picoserve::routing::RequestHandlerService<()> for HandleFileList {
    async fn call_request_handler_service<R: Read, W: picoserve::response::ResponseWriter<Error = R::Error>>(
        &self,
        (): &(),
        (): (),
        request: picoserve::request::Request<'_, R>,
        response_writer: W,
    ) -> Result<picoserve::ResponseSent, W::Error> {
        let connection = request.body_connection.finalize().await?;

        ChunkedResponse::new(FileListChunks {})
            .into_response()
            .write_to(connection, response_writer)
            .await
    }
}

const MAX_LENGTH: usize = 128;

struct FileListChunks;

impl Chunks for FileListChunks {
    fn content_type(&self) -> &'static str {
        "application/json"
    }

    async fn write_chunks<W: picoserve::io::Write>(self, mut chunk_writer: ChunkWriter<W>) -> Result<ChunksWritten, W::Error> {
        let mut flash = FlashStorage::new();
        let local_fs = LocalFs::new(&mut flash);

        let entries = match local_fs.dir() {
            Ok(entries) => entries,
            Err(err) => {
                // panic!("Dir Error: {err:?}");
                chunk_writer.write_chunk(format!("Dir Error: {err:?}").as_bytes()).await?;

                return chunk_writer.finalize().await;
            }
        };

        chunk_writer.write_chunk(b"[").await?;

        for (i, entry) in entries.iter().enumerate() {
            let json = match serde_json_core::to_string::<FileEntry, MAX_LENGTH>(entry) {
                Ok(json) => json,
                Err(err) => {
                    panic!("JSON Error: {err:?}");
                }
            };

            chunk_writer.write_chunk(json.as_bytes()).await?;

            if i < entries.len() - 1 {
                chunk_writer.write_chunk(b",").await?;
            }
        }

        chunk_writer.write_chunk(b"]").await?;

        chunk_writer.finalize().await
    }
}
