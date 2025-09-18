use crate::services::common::Tag;
use async_trait::async_trait;
use ezsockets::ClientConfig;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};

pub struct WebSocketService {}

struct MyClient {
    evt_tx: mpsc::UnboundedSender<WebSocketIncoming>,
}

// Message types for WebSocket communication
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketOutgoing {
    #[serde(rename = "announce")]
    Announce { name: String },

    #[serde(rename = "tag_scanned")]
    TagScanned { allowed: bool, code: String, timestamp: u64 },

    #[serde(rename = "latch_changed")]
    LatchChanged { latch_state: bool },

    #[serde(rename = "status_update")]
    StatusUpdate { status: String, message: String },
}

// Message types for WebSocket communication
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketIncoming {
    #[serde()]
    Connected,

    #[serde(rename = "push_tags")]
    TagInfo { tags: Vec<Tag> },

    #[serde(rename = "latch_change")]
    LatchChange { latch_state: bool },

    #[serde(rename = "ping")]
    Ping { payload: String },
}

#[async_trait]
impl ezsockets::ClientExt for MyClient {
    type Call = ();

    async fn on_text(&mut self, text: ezsockets::Utf8Bytes) -> Result<(), ezsockets::Error> {
        tracing::debug!("Received message: {}", text);

        // Try to parse as WebSocket message
        match serde_json::from_str::<WebSocketIncoming>(&text) {
            Ok(msg) => {
                tracing::debug!("Received web socket message: {:?}", msg);

                self.evt_tx.send(msg);
            }
            Err(e) => {
                tracing::warn!("Failed to parse message as JSON: {} - Raw message: {}", e, text);
            }
        }

        Ok(())
    }

    async fn on_binary(&mut self, bytes: ezsockets::Bytes) -> Result<(), ezsockets::Error> {
        tracing::debug!("Received bytes: {:?}", bytes);

        Ok(())
    }

    async fn on_call(&mut self, call: Self::Call) -> Result<(), ezsockets::Error> {
        let () = call;

        Ok(())
    }

    async fn on_connect(&mut self) -> Result<(), ezsockets::Error> {
        tracing::info!("on_connect");

        self.evt_tx.send(WebSocketIncoming::Connected).unwrap();

        Ok(())
    }
}

impl WebSocketService {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn run(
        &mut self,
        mut cmd_rx: mpsc::UnboundedReceiver<WebSocketOutgoing>,
        evt_tx: mpsc::UnboundedSender<WebSocketIncoming>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // let config = ClientConfig::new("ws://10.47.49.69:3000/ws");
        // let config = ClientConfig::new("ws://10.3.2.138:3000/ws");
        let config = ClientConfig::new("ws://10.3.1.20:8472/ws");

        let (handle, future) = ezsockets::connect(move |_client| MyClient { evt_tx }, config).await;

        let handle_1 = handle.clone();

        let read_task = tokio::spawn(async move {
            if let Err(e) = future.await {
                tracing::error!("WebSocket connection failed: {}", e);
            }
        });

        let handle_2 = handle.clone();

        let write_task = tokio::spawn(async move {
            while let Some(command) = cmd_rx.recv().await {
                if let Ok(json) = serde_json::to_string(&command) {
                    if let Err(e) = handle_2.text(json) {
                        tracing::error!("Failed to write to web socket: {}", e);
                    }
                }
            }
        });

        // Wait for either task to complete (which indicates an error or shutdown)
        tokio::select! {
            result = read_task => {
                if let Err(e) = result {
                    tracing::error!("Web socket read task failed: {}", e);
                }
            }
            result = write_task => {
                if let Err(e) = result {
                    tracing::error!("Web socket write task failed: {}", e);
                }
            }
        }

        Ok(())
    }
}
