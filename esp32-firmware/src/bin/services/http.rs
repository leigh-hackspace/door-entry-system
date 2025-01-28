use alloc::string::{String, ToString};
use core::{
    net::{IpAddr, Ipv4Addr},
    str::from_utf8,
};
use embassy_net::{
    tcp::client::{TcpClient, TcpClientState},
    Stack,
};
use embassy_time::Duration;
use embedded_nal_async::Dns;
use log::{info, warn};
use reqwless::{
    client::HttpClient,
    headers::ContentType,
    request::{Method, RequestBuilder},
};

struct DummyDns {}

impl Dns for DummyDns {
    type Error = usize;

    async fn get_host_by_name(&self, host: &str, addr_type: embedded_nal_async::AddrType) -> Result<core::net::IpAddr, usize> {
        info!("get_host_by_name: {}", host);

        // TODO: For now only parses IP addresses....
        Ok(IpAddr::V4(Ipv4Addr::parse_ascii(host.as_bytes()).unwrap()))
    }

    async fn get_host_by_address(&self, addr: core::net::IpAddr, result: &mut [u8]) -> Result<usize, usize> {
        info!("get_host_by_address: {}", addr);

        todo!()
    }
}

pub struct HttpService<'a> {
    stack: Stack<'a>,
}

#[derive(Debug)]
pub enum HttpError {
    LinkDown,
    RequestError,
    SendError,
    ReadError,
    DecodeError,
}

impl<'a> HttpService<'a> {
    pub fn new(stack: Stack<'a>) -> Self {
        Self { stack }
    }

    pub async fn do_http_request(&self, url: String, data: String) -> Result<String, HttpError> {
        let stack = self.stack;

        if !stack.is_link_up() {
            warn!("do_http_request: Link is down");
            return Err(HttpError::LinkDown);
        }

        let state = TcpClientState::<1, 1024, 1024>::new();
        let mut tcp_client = TcpClient::new(stack, &state);

        tcp_client.set_timeout(Some(Duration::from_secs(1)));

        let mut client = HttpClient::new(&tcp_client, &DummyDns {}); // Types implementing embedded-nal-async

        let s: &[u8] = data.as_bytes();

        let mut rx_buf = [0; 1024];

        let handle = client.request(Method::POST, &url).await.map_err(|_err| HttpError::RequestError)?;

        let mut builder = handle.body(s).content_type(ContentType::TextPlain);

        let response = builder.send(&mut rx_buf).await.map_err(|_err| HttpError::SendError)?;

        let data = response.body().read_to_end().await.map_err(|_err| HttpError::ReadError)?;

        let text = from_utf8(data).map_err(|_err| HttpError::DecodeError)?;

        Ok(text.to_string())
    }
}
