use crate::utils::local_fs::LocalFs;
use alloc::format;
use embedded_io_async::Read;
use esp_storage::FlashStorage;
use picoserve::response::IntoResponse;

pub struct HandleFileDelete {}

impl picoserve::routing::RequestHandlerService<()> for HandleFileDelete {
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

        if let Err(err) = local_fs.delete_file(&file_name) {
            return format!("Delete Error: {err:?}")
                .write_to(request.body_connection.finalize().await?, response_writer)
                .await;
        }

        format!("Deleted: {file_name}\r\n")
            .write_to(request.body_connection.finalize().await?, response_writer)
            .await
    }
}
