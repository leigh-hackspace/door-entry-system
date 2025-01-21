use crate::utils::local_fs::LocalFs;
use alloc::format;
use esp_println::print;
use esp_storage::FlashStorage;
use fatfs::Write as _;
use log::info;
use picoserve::{io::Read, response::IntoResponse};

pub struct HandleFileWrite;

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
        let mut buffer = [0; 128];
        let mut total_size = 0;

        loop {
            let read_size = reader.read(&mut buffer).await?;
            if read_size == 0 {
                break;
            }

            if let Err(err) = file.write_all(&buffer[0..read_size]) {
                return format!("Write Error: {err}")
                    .write_to(request.body_connection.finalize().await?, response_writer)
                    .await;
            }

            print!(".");

            total_size += read_size;
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

        format!("Total Size: {total_size}\r\n")
            .write_to(request.body_connection.finalize().await?, response_writer)
            .await
    }
}
