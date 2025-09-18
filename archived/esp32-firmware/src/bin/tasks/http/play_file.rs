use crate::services::common::{MainPublisher, SystemMessage};
use alloc::{format, sync::Arc};
use embedded_io_async::Read;
use picoserve::response::IntoResponse;

pub struct HandleFilePlay {
    pub publisher: &'static Arc<MainPublisher>,
}

impl picoserve::routing::RequestHandlerService<()> for HandleFilePlay {
    async fn call_request_handler_service<R: Read, W: picoserve::response::ResponseWriter<Error = R::Error>>(
        &self,
        (): &(),
        (): (),
        request: picoserve::request::Request<'_, R>,
        response_writer: W,
    ) -> Result<picoserve::ResponseSent, W::Error> {
        let query = request.parts.query().unwrap().try_into_string::<50>().unwrap();

        let file_name = query.replace("file=", "");

        self.publisher.publish(SystemMessage::PlayFile(file_name.clone())).await;

        format!("Playing: {file_name}\r\n")
            .write_to(request.body_connection.finalize().await?, response_writer)
            .await
    }
}
