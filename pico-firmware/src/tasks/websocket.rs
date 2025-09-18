use crate::utils::local_fs::FileEntry;
use alloc::borrow::ToOwned;
use alloc::fmt;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;
use core::future::join;
use core::net::Ipv4Addr;
use core::net::Ipv6Addr;
use core::net::SocketAddr;
use defmt::*;
use edge_http::io::client::Connection;
use edge_http::ws::{MAX_BASE64_KEY_LEN, MAX_BASE64_KEY_RESPONSE_LEN, NONCE_LEN};
use edge_nal::AddrType;
use edge_nal::Dns;
use edge_nal::TcpConnect;
use edge_nal_embassy::DnsError;
use edge_nal_embassy::Tcp;
use edge_nal_embassy::TcpBuffers;
use edge_nal_embassy::TcpError;
use edge_ws::{FrameHeader, FrameType};
use embassy_futures::select::select;
use embassy_rp::clocks::RoscRng;
use embassy_sync::channel::Channel;
use embassy_sync::channel::Receiver;
use embassy_sync::channel::Sender;
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Timer};
use serde::Deserialize;
use serde::Serialize;

const WEB_SOCKET_SERVER: (&str, &str, &str) = (env!("WEB_SOCKET_SERVER_HOST"), env!("WEB_SOCKET_SERVER_PORT"), "/ws");

pub type WebSocketOutgoingChannel = Channel<CriticalSectionRawMutex, WebSocketOutgoing, 1>;
pub type WebSocketOutgoingReceiver = Receiver<'static, CriticalSectionRawMutex, WebSocketOutgoing, 1>;

pub type WebSocketIncomingChannel = Channel<CriticalSectionRawMutex, WebSocketIncoming, 1>;
pub type WebSocketIncomingSender = Sender<'static, CriticalSectionRawMutex, WebSocketIncoming, 1>;

#[embassy_executor::task]
pub async fn websocket_task(
    stack: embassy_net::Stack<'static>,
    web_socket_outgoing_receiver: WebSocketOutgoingReceiver,
    web_socket_incoming_sender: WebSocketIncomingSender,
) -> ! {
    let mut buf = [0_u8; 8192];

    let buffers = TcpBuffers::<1, 1024, 1024>::new();

    let tcp = Tcp::new(stack, &buffers);
    let dns = edge_nal_embassy::Dns::new(stack);

    loop {
        match websocket_connect(&dns, &tcp, &mut buf, web_socket_outgoing_receiver, web_socket_incoming_sender).await {
            Ok(()) => warn!("WebSocket disconnected"),
            Err(err) => info!("WebSocket error: {:?}", err),
        };

        info!("WebSocket reconnecting...");
    }
}

#[derive(Debug)]
enum WsClient {
    Dns(DnsError),
    Io(edge_http::io::Error<TcpError>),
    Ws(edge_ws::io::Error<TcpError>),
    Serde(serde_json::Error),
    Misc(String),
}

impl defmt::Format for WsClient {
    fn format(&self, f: defmt::Formatter<'_>) {
        match self {
            WsClient::Dns(e) => defmt::write!(f, "DNS error"),
            WsClient::Io(e) => defmt::write!(f, "IO error"),
            WsClient::Ws(e) => defmt::write!(f, "WebSocket error"),
            WsClient::Serde(e) => defmt::write!(f, "Serde error"),
            WsClient::Misc(msg) => defmt::write!(f, "Error: {}", msg.as_str()),
        }
    }
}

// Automatic conversions
impl From<DnsError> for WsClient {
    fn from(err: DnsError) -> Self {
        WsClient::Dns(err)
    }
}

impl From<edge_http::io::Error<TcpError>> for WsClient {
    fn from(err: edge_http::io::Error<TcpError>) -> Self {
        WsClient::Io(err)
    }
}

impl From<edge_ws::io::Error<TcpError>> for WsClient {
    fn from(err: edge_ws::io::Error<TcpError>) -> Self {
        WsClient::Ws(err)
    }
}

impl From<serde_json::Error> for WsClient {
    fn from(err: serde_json::Error) -> Self {
        WsClient::Serde(err)
    }
}

async fn websocket_connect(
    dns: &edge_nal_embassy::Dns<'_>,
    tcp: &Tcp<'_, 1>,
    buf: &mut [u8],
    web_socket_outgoing_receiver: WebSocketOutgoingReceiver,
    web_socket_incoming_sender: WebSocketIncomingSender,
) -> Result<(), WsClient> {
    let (fqdn, port, path) = WEB_SOCKET_SERVER;

    info!("About to open an HTTP connection to {} port {}", fqdn, port);

    // No more .map_err() needed for these types!
    let ip = dns.get_host_by_name(fqdn, AddrType::IPv4).await?;
    let mut conn: Connection<_> = Connection::new(buf, tcp, SocketAddr::new(ip, u16::from_str_radix(port, 10).unwrap()));

    let mut rng = RoscRng;

    let mut nonce = [0_u8; NONCE_LEN];
    nonce.fill_with(|| (rng.next_u32() & 0xff) as u8);

    let mut buf = [0_u8; MAX_BASE64_KEY_LEN];

    conn.initiate_ws_upgrade_request(Some(fqdn), Some("foo.com"), path, None, &nonce, &mut buf)
        .await?;
    conn.initiate_response().await?;

    let mut buf = [0_u8; MAX_BASE64_KEY_RESPONSE_LEN];

    if !conn.is_ws_upgrade_accepted(&nonce, &mut buf)? {
        error!("WS upgrade failed");
        return Err(WsClient::Misc(format!("WS upgrade failed")));
    }

    conn.complete().await?;

    let (mut socket, buf) = conn.release();
    info!("Connection upgraded to WS, starting traffic now");

    web_socket_incoming_sender.send(WebSocketIncoming::Connected).await;

    loop {
        info!("WS Loop");
        let await_select = select(FrameHeader::recv(&mut socket), web_socket_outgoing_receiver.receive()).await;

        match await_select {
            embassy_futures::select::Either::First(header) => {
                let header = header?;

                match header.frame_type {
                    FrameType::Text(_) => {
                        let payload = header.recv_payload(&mut socket, buf).await?;

                        info!("===== IN: {}", core::str::from_utf8(payload).unwrap());

                        let incoming = serde_json::from_slice::<WebSocketIncoming>(payload)?;

                        web_socket_incoming_sender.send(incoming).await;
                    }
                    FrameType::Binary(_fragmented) => {
                        let payload = header.recv_payload(&mut socket, buf).await?;

                        web_socket_incoming_sender.send(WebSocketIncoming::FileData { data: payload.to_owned() }).await;
                    }
                    _ => {
                        return Err(WsClient::Misc(format!("Unexpected ?")));
                    }
                }

                if !header.frame_type.is_final() {
                    // error!("Unexpected fragmented frame");
                    return Err(WsClient::Misc(format!("Unexpected fragmented frame")));
                }
            }
            embassy_futures::select::Either::Second(outgoing) => {
                if let WebSocketOutgoing::FileData { data } = outgoing {
                    let header = FrameHeader {
                        frame_type: FrameType::Binary(false),
                        payload_len: data.len() as _,
                        mask_key: Some(rng.next_u32()),
                    };

                    info!("Sending binary data: {}", data.len());
                    header.send(&mut socket).await?;
                    header.send_payload(&mut socket, &data).await?
                } else {
                    let payload = serde_json::to_vec(&outgoing)?;

                    let header = FrameHeader {
                        frame_type: FrameType::Text(false),
                        payload_len: payload.len() as _,
                        mask_key: Some(rng.next_u32()),
                    };

                    info!("==== OUT: {}", core::str::from_utf8(&payload).unwrap());
                    header.send(&mut socket).await?;
                    header.send_payload(&mut socket, &payload).await?;
                }
            }
        }
    }

    let header = FrameHeader {
        frame_type: FrameType::Close,
        payload_len: 0,
        mask_key: Some(rng.next_u32()),
    };

    info!("Closing");
    header.send(&mut socket).await?;

    Ok(())
}

// Message types for WebSocket communication
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketOutgoing {
    #[serde(rename = "announce")]
    Announce {
        name: String,
    },

    #[serde(rename = "tag_scanned")]
    TagScanned {
        allowed: bool,
        code: String,
        timestamp: u64,
    },

    #[serde(rename = "latch_changed")]
    LatchChanged {
        latch_state: bool,
    },

    #[serde(rename = "status_update")]
    StatusUpdate {
        status: String,
        message: String,
    },

    #[serde(rename = "file_start")]
    FileStart {
        file_name: String,
        length: u32,
    },

    FileData {
        data: Vec<u8>,
    },

    #[serde(rename = "file_list")]
    FileList {
        list: Vec<FileEntry>,
    },
}

// Message types for WebSocket communication
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketIncoming {
    #[serde()]
    Connected,

    #[serde(rename = "push_tags")]
    TagInfo {
        tags: Vec<Tag>,
    },

    #[serde(rename = "latch_change")]
    LatchChange {
        latch_state: bool,
    },

    #[serde(rename = "ping")]
    Ping {
        payload: String,
    },

    #[serde(rename = "file_start")]
    FileStart {
        file_name: String,
        length: u32,
    },

    FileData {
        data: Vec<u8>,
    },

    #[serde(rename = "file_request")]
    FileRequest {
        file_name: String,
    },

    #[serde(rename = "file_delete")]
    FileDelete {
        file_name: String,
    },

    #[serde(rename = "file_list")]
    FileList {},

    #[serde(rename = "play")]
    Play {
        file_name: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub tag_name: String,
    pub code: String,
    pub member_name: String,
}
