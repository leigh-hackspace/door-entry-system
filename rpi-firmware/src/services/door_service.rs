use crate::services;
use services::serial_service::SerialCommand;
use tokio::{
    sync::mpsc,
    time::{Duration, sleep},
};

// Door service for handling door operations
pub struct DoorService {
    serial_cmd_tx: mpsc::UnboundedSender<SerialCommand>,
}

impl DoorService {
    pub fn new(serial_cmd_tx: mpsc::UnboundedSender<SerialCommand>) -> Self {
        Self { serial_cmd_tx }
    }

    pub fn set_latch(&self, state: bool) {
        if state {
            tracing::info!("Opening door...");

            // Send command to GPIO device via serial
            if let Err(e) = self.serial_cmd_tx.send(SerialCommand::Lock(false)) {
                tracing::error!("Failed to send open door command: {}", e);
            }

            // Set green LED
            if let Err(e) = self.serial_cmd_tx.send(SerialCommand::SetLeds([
                0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000,
            ])) {
                tracing::error!("Failed to set LED: {}", e);
            }
        } else {
            tracing::info!("Closing door...");

            // Send command to GPIO device via serial
            if let Err(e) = self.serial_cmd_tx.send(SerialCommand::Lock(true)) {
                tracing::error!("Failed to send close door command: {}", e);
            }

            // Set green LED
            if let Err(e) = self.serial_cmd_tx.send(SerialCommand::SetLeds([
                0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00,
            ])) {
                tracing::error!("Failed to set LED: {}", e);
            }
        }
    }

    pub async fn open_door(&self) {
        tracing::info!("Opening door...");

        // Send command to GPIO device via serial
        if let Err(e) = self.serial_cmd_tx.send(SerialCommand::Lock(false)) {
            tracing::error!("Failed to send open door command: {}", e);
        }

        // Set green LED
        if let Err(e) = self.serial_cmd_tx.send(SerialCommand::SetLeds([
            0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000,
        ])) {
            tracing::error!("Failed to set LED: {}", e);
        }

        // Simulate door staying open for 5 seconds
        let serial_cmd_tx = self.serial_cmd_tx.clone();
        tokio::spawn(async move {
            sleep(Duration::from_secs(5)).await;

            tracing::info!("Door closed automatically");

            if let Err(e) = serial_cmd_tx.send(SerialCommand::Lock(true)) {
                tracing::error!("Failed to send close door command: {}", e);
            }

            // Turn off LEDs
            if let Err(e) = serial_cmd_tx.send(SerialCommand::SetLeds([
                0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00, 0x00ff00,
            ])) {
                tracing::error!("Failed to turn off LEDs: {}", e);
            }
        });
    }

    pub async fn access_denied(&self) {
        tracing::info!("Access denied - showing red LED and beep");

        // Set red LED and beep
        if let Err(e) = self.serial_cmd_tx.send(SerialCommand::SetLeds([
            0xffff00, 0xffff00, 0xffff00, 0xffff00, 0xffff00, 0xffff00, 0xffff00, 0xffff00,
        ])) {
            tracing::error!("Failed to set red LED: {}", e);
        }

        if let Err(e) = self.serial_cmd_tx.send(SerialCommand::Beep { duration_ms: 1000 }) {
            tracing::error!("Failed to send beep command: {}", e);
        }

        // Turn off red LED after 2 seconds
        let serial_cmd_tx = self.serial_cmd_tx.clone();
        tokio::spawn(async move {
            sleep(Duration::from_secs(2)).await;

            if let Err(e) = serial_cmd_tx.send(SerialCommand::SetLeds([
                0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000, 0xff0000,
            ])) {
                tracing::error!("Failed to turn off red LED: {}", e);
            }
        });
    }
}
