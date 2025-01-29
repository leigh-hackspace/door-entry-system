use alloc::string::String;
use picoserve::{response::IntoResponse, ResponseSent};

pub struct StringResponse {
    pub str: String,
}

impl IntoResponse for StringResponse {
    async fn write_to<R: picoserve::io::Read, W: picoserve::response::ResponseWriter<Error = R::Error>>(
        self,
        connection: picoserve::response::Connection<'_, R>,
        response_writer: W,
    ) -> Result<ResponseSent, W::Error> {
        let Self { str } = self;

        format_args!("{str}").write_to(connection, response_writer).await
    }
}
