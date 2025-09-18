use alloc::format;
use core::{
    net::{IpAddr, Ipv4Addr},
    str::from_utf8,
};
use embassy_net::{
    tcp::client::{TcpClient, TcpClientState},
    Stack,
};
use embassy_time::{Duration, Timer};
use embedded_nal_async::Dns;
use log::info;
use reqwless::{
    client::HttpClient,
    headers::ContentType,
    request::{Method, RequestBuilder},
};

struct DummyDns {}

impl Dns for DummyDns {
    type Error = usize;

    async fn get_host_by_name(
        &self,
        host: &str,
        addr_type: embedded_nal_async::AddrType,
    ) -> Result<core::net::IpAddr, usize> {
        info!("get_host_by_name: {}", host);

        // TODO: For now only parses IP addresses....
        Ok(IpAddr::V4(Ipv4Addr::parse_ascii(host.as_bytes()).unwrap()))
    }

    async fn get_host_by_address(
        &self,
        addr: core::net::IpAddr,
        result: &mut [u8],
    ) -> Result<usize, usize> {
        info!("get_host_by_address: {}", addr);

        todo!()
    }
}

#[embassy_executor::task]
pub async fn check_task(stack: Stack<'static>) {
    stack.wait_config_up().await;

    loop {
        Timer::after(Duration::from_millis(10000)).await;

        let state = TcpClientState::<1, 4096, 4096>::new();
        let tcp_client = TcpClient::new(stack, &state);

        let url = format!("http://1.1.1.1:{}", 80);
        let mut client = HttpClient::new(&tcp_client, &DummyDns {}); // Types implementing embedded-nal-async

        let s: &[u8] = b"PING";

        let mut rx_buf = [0; 4096];

        let mut builder = client
            .request(Method::POST, &url)
            .await
            .unwrap()
            .body(s)
            .content_type(ContentType::TextPlain);

        let response = builder.send(&mut rx_buf).await.unwrap();

        info!(
            "RESPONSE: {}",
            from_utf8(response.body().read_to_end().await.unwrap()).unwrap()
        );
    }
}
