use async_trait::async_trait;
use ezsockets::ClientConfig;
use serde::{Deserialize, Serialize};
use services::common::AppEvent;
use services::common::Tag;
use services::{
    door_service::DoorService,
    serial_service::{SerialCommand, SerialEvent, SerialService},
    tag_service::TagService,
};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::thread::Thread;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{RwLock, mpsc};
use tokio::time::{Duration, sleep};

use services::serial_service;
use services::tag_service;
use services::web_socket_service::WebSocketService;

use crate::services::door_service;
use crate::services::web_socket_service::WebSocketIncoming;
use crate::services::web_socket_service::WebSocketOutgoing;

mod services;

// Main application
pub struct DoorAccessApp {}

impl DoorAccessApp {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn run(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let tag_service = TagService::new("tags.json");

        // Load existing tags
        tag_service.load_tags().await?;

        // Set up event channel
        let (app_tx, mut app_rx) = mpsc::unbounded_channel::<AppEvent>();

        let mut web_socket_service = WebSocketService::new();

        let (ws_cmd_tx, mut ws_cmd_rx) = mpsc::unbounded_channel::<WebSocketOutgoing>();
        let (ws_evt_tx, mut ws_evt_rx) = mpsc::unbounded_channel::<WebSocketIncoming>();

        let serial_service = SerialService::new(None, None);

        let (serial_cmd_tx, serial_cmd_rx) = mpsc::unbounded_channel::<SerialCommand>();
        let (serial_evt_tx, mut serial_evt_rx) = mpsc::unbounded_channel::<SerialEvent>();

        let door_service = DoorService::new(serial_cmd_tx);

        // Spawn WebSocket future
        tokio::spawn(async move {
            if let Err(e) = web_socket_service.run(ws_cmd_rx, ws_evt_tx).await {
                tracing::error!("Web socket service failed: {}", e);
            }
        });

        // Spawn RFID scanner task
        let scanner_sender = app_tx.clone();
        tokio::spawn(async move {
            Self::run_rfid_scanner(scanner_sender).await;
        });

        tokio::spawn(async move {
            if let Err(e) = serial_service.run(serial_cmd_rx, serial_evt_tx).await {
                tracing::error!("Serial service failed: {}", e);
            }
        });

        let ws_app_tx = app_tx.clone();
        tokio::spawn(async move {
            while let Some(event) = ws_evt_rx.recv().await {
                match event {
                    WebSocketIncoming::Connected => {
                        ws_app_tx.send(AppEvent::Connected).unwrap();
                    }
                    WebSocketIncoming::TagInfo { tags } => {
                        tracing::info!("Server sent tags");
                        ws_app_tx.send(AppEvent::TagsUpdated(tags)).unwrap();
                    }
                    WebSocketIncoming::LatchChange { latch_state } => {
                        ws_app_tx.send(AppEvent::SetLatch(latch_state)).unwrap();
                    }
                    WebSocketIncoming::Ping { payload } => {
                        tracing::info!("Server sent {payload}");
                    }
                }
            }
        });

        let serial_app_tx = app_tx.clone();
        tokio::spawn(async move {
            while let Some(event) = serial_evt_rx.recv().await {
                match event {
                    SerialEvent::CodeDetected { code } => {
                        serial_app_tx.send(AppEvent::TagScanned(code)).unwrap();
                    }
                    SerialEvent::ButtonShortPress => {
                        serial_app_tx.send(AppEvent::OpenDoor).unwrap();
                    }
                    SerialEvent::ButtonLongPress => {}
                    // SerialEvent::DoorSensorChanged { is_open } => {}
                    SerialEvent::Error { message } => {}
                }
            }
        });

        // Main event loop
        while let Some(event) = app_rx.recv().await {
            match event {
                AppEvent::Connected => {
                    ws_cmd_tx.send(WebSocketOutgoing::StatusUpdate {
                        status: "connected".to_string(),
                        message: "Door access system connected".to_string(),
                    });

                    ws_cmd_tx.send(WebSocketOutgoing::Announce { name: "Main Space".to_owned() });
                }
                AppEvent::TagScanned(code) => {
                    tracing::info!("Checking tag: {}", code);

                    if tag_service.check_tag(&code).await {
                        // Send telemetry to server
                        ws_cmd_tx.send(WebSocketOutgoing::TagScanned {
                            allowed: true,
                            code: code.to_string(),
                            timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
                        });

                        if let Some(tag) = tag_service.get_tag(&code).await {
                            tracing::info!("Access granted for {} ({})", tag.member_name, tag.tag_name);
                            door_service.open_door().await;

                            ws_cmd_tx.send(WebSocketOutgoing::StatusUpdate {
                                status: "access_granted".to_string(),
                                message: format!("Access granted for {}", tag.member_name),
                            });
                        }
                    } else {
                        tracing::warn!("Access denied for unknown tag: {}", code);

                        // Send telemetry to server
                        ws_cmd_tx.send(WebSocketOutgoing::TagScanned {
                            allowed: false,
                            code: code.to_string(),
                            timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs(),
                        });

                        ws_cmd_tx.send(WebSocketOutgoing::StatusUpdate {
                            status: "access_denied".to_string(),
                            message: format!("Unknown tag: {}", code),
                        });
                    }
                }
                AppEvent::TagsUpdated(tags) => {
                    tag_service.update_tags(tags).await?;

                    tracing::info!("Tags updated from server");
                }
                AppEvent::OpenDoor => {
                    door_service.open_door().await;
                }
                AppEvent::DoorOpened => {
                    tracing::info!("Door opened event processed");
                }
                AppEvent::SetLatch(state) => {
                    door_service.set_latch(state);

                    ws_cmd_tx.send(WebSocketOutgoing::LatchChanged { latch_state: state });
                }
            }
        }

        Ok(())
    }

    async fn run_rfid_scanner(event_sender: mpsc::UnboundedSender<AppEvent>) {
        tracing::info!("RFID scanner started (console input mode)");
        let stdin = tokio::io::stdin();
        let mut reader = BufReader::new(stdin);
        let mut line = String::new();

        loop {
            line.clear();

            match reader.read_line(&mut line).await {
                Ok(0) => break, // EOF
                Ok(_) => {
                    let code = line.trim().to_string();
                    if !code.is_empty() {
                        if let Err(e) = event_sender.send(AppEvent::TagScanned(code)) {
                            tracing::error!("Failed to send TagScanned event: {}", e);
                            break;
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Error reading from stdin: {}", e);
                    break;
                }
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let mut app = DoorAccessApp::new();
    app.run().await?;

    Ok(())
}
