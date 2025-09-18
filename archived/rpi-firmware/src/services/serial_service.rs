use bytes::BytesMut;
use futures::SinkExt;
use futures::stream::StreamExt;
use std::sync::Arc;
use std::{
    env,
    io::{self, Read, Write},
    str,
};
use tokio::sync::Notify;
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use tokio::time::{Duration, sleep};
use tokio_serial::{SerialPort, SerialPortBuilderExt, SerialStream};
use tokio_util::codec::{Decoder, Encoder};

// const DEFAULT_TTY: &str = "/dev/ttyUSB0";
// const DEFAULT_TTY: &str = "/dev/cu.usbmodemC4228F0648F52";
const DEFAULT_TTY: &str = "/dev/ttyAMA0";

// stty -f /dev/cu.usbmodemC4228F0648F52 115200 && echo "LED 0000ff" > /dev/cu.usbmodemC4228F0648F52

struct LineCodec;

impl Decoder for LineCodec {
    type Item = String;
    type Error = io::Error;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        let newline = src.as_ref().iter().position(|b| *b == b'\n');
        if let Some(n) = newline {
            let line = src.split_to(n + 1);
            return match str::from_utf8(line.as_ref()) {
                Ok(s) => Ok(Some(s.trim().to_string())),
                Err(_) => Err(io::Error::new(io::ErrorKind::Other, "Invalid String")),
            };
        }
        Ok(None)
    }
}

impl Encoder<String> for LineCodec {
    type Error = io::Error;

    fn encode(&mut self, item: String, dst: &mut BytesMut) -> Result<(), Self::Error> {
        dst.extend_from_slice(item.as_bytes());
        dst.extend_from_slice(b"\n");

        Ok(())
    }
}

pub struct SerialService {
    port_path: String,
    baud_rate: u32,
}

// Serial service messages
#[derive(Debug, Clone)]
pub enum SerialCommand {
    SetLeds([u32; 8]),
    Lock(bool),
    Beep { duration_ms: u32 },
}

#[derive(Debug, Clone)]
pub enum SerialEvent {
    CodeDetected { code: String },
    ButtonShortPress,
    ButtonLongPress,
    Error { message: String },
}

impl SerialService {
    pub fn new(port_path: Option<String>, baud_rate: Option<u32>) -> Self {
        Self {
            port_path: port_path.unwrap_or_else(|| DEFAULT_TTY.to_string()),
            baud_rate: baud_rate.unwrap_or(115200),
        }
    }

    pub async fn run(
        &self,
        mut cmd_rx: mpsc::UnboundedReceiver<SerialCommand>,
        evt_tx: mpsc::UnboundedSender<SerialEvent>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        tracing::info!("Opening serial port: {} at {} baud", self.port_path, self.baud_rate);

        let mut port = tokio_serial::new(&self.port_path, self.baud_rate).open_native_async().unwrap();
        port.set_exclusive(false)?;

        let (mut writer, mut reader) = LineCodec.framed(port).split();

        // // Channel for read->write acknowledgements
        // let (ack_tx, mut ack_rx) = mpsc::channel::<()>(1);

        let evt_tx_in = evt_tx.clone();
        // let ack_tx_in = ack_tx.clone();

        // Reader task
        let read_task = tokio::spawn(async move {
            loop {
                if let Some(line_result) = reader.next().await {
                    match line_result {
                        Ok(line) => {
                            tracing::debug!("Serial received: {}", line);

                            // // Ack writer (if there's space in channel)
                            // let _ = ack_tx_in.try_send(());

                            if let Some(event) = Self::parse_serial_input(&line) {
                                if let Err(e) = evt_tx_in.send(event) {
                                    tracing::error!("Failed to send serial event: {}", e);
                                    break;
                                }
                            }
                        }
                        Err(e) => {
                            tracing::error!("Serial read error: {}", e);
                            let _ = evt_tx_in.send(SerialEvent::Error {
                                message: format!("Serial read error: {}", e),
                            });
                        }
                    }
                }
            }
        });

        // Writer task
        let evt_tx_out = evt_tx.clone();
        let write_task = tokio::spawn(async move {
            while let Some(command) = cmd_rx.recv().await {
                let command_string = Self::format_command(&command);
                tracing::debug!("Sending serial command: {}", command_string);

                if let Err(e) = writer.send(command_string).await {
                    tracing::error!("Failed to send serial command: {}", e);
                    let _ = evt_tx_out.send(SerialEvent::Error {
                        message: format!("Serial write error: {}", e),
                    });
                }

                // Device is slow...
                sleep(Duration::from_millis(100)).await;

                // // Wait for ack or timeout before next command
                // tokio::select! {
                //     _ = ack_rx.recv() => {
                //         tracing::debug!("Response received, writer continues");
                //     }
                //     _ = sleep(Duration::from_millis(500)) => {
                //         tracing::warn!("Timeout waiting for response, writer continues");
                //     }
                // }
            }
        });

        // Shutdown coordination
        tokio::select! {
            result = read_task => {
                if let Err(e) = result {
                    tracing::error!("Serial read task failed: {}", e);
                }
            }
            result = write_task => {
                if let Err(e) = result {
                    tracing::error!("Serial write task failed: {}", e);
                }
            }
        }

        Ok(())
    }

    fn parse_serial_input(line: &str) -> Option<SerialEvent> {
        if line.starts_with("CODE ") {
            let code = line.strip_prefix("CODE ")?.trim().to_string();
            Some(SerialEvent::CodeDetected { code })
        } else if line.starts_with("SHORT PRESS") {
            Some(SerialEvent::ButtonShortPress)
        } else if line.starts_with("LONG PRESS") {
            Some(SerialEvent::ButtonLongPress)
        } else if line.starts_with("ERROR ") {
            let message = line.strip_prefix("ERROR ")?.trim().to_string();
            Some(SerialEvent::Error { message })
        } else {
            tracing::debug!("Unrecognized serial input: {}", line);
            None
        }
    }

    fn format_command(command: &SerialCommand) -> String {
        match command {
            SerialCommand::SetLeds(leds) => {
                let leds: &[u32; 8] = leds;

                // Convert the contents of leds to a command with hex params
                let cmd_str = format!(
                    "LED {:06X} {:06X} {:06X} {:06X} {:06X} {:06X} {:06X} {:06X}",
                    leds[0], leds[1], leds[2], leds[3], leds[4], leds[5], leds[6], leds[7]
                );

                // let cmd_str = format!("LED {:06X} {:06X} {:06X} {:06X}", leds[0], leds[1], leds[2], leds[3]);

                cmd_str
            }
            SerialCommand::Lock(lock) => format!("LOCK {}", if *lock { "1" } else { "0" }),
            SerialCommand::Beep { duration_ms } => format!("BEEP {}", duration_ms),
        }
    }
}
