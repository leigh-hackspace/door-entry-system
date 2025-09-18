use core::net::Ipv4Addr;
use embassy_net::Stack;
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Timer};
use esp_println::println;
use esp_wifi::wifi::{WifiController, WifiState};

const SSID: &str = env!("SSID");
const PASSWORD: &str = env!("PASSWORD");

#[derive(PartialEq, Debug)]
pub enum WifiCommandSignalMessage {
    Connect,
    Disconnect,
}

pub type WifiCommandSignal = Signal<CriticalSectionRawMutex, WifiCommandSignalMessage>;

#[derive(PartialEq, Debug)]
pub enum WifiStatusSignalMessage {
    Connected(Ipv4Addr),
    Interrupted,
    Disconnected,
    Reset,
}

pub type WifiStatusSignal = Signal<CriticalSectionRawMutex, WifiStatusSignalMessage>;

// maintains wifi connection, when it disconnects it tries to reconnect
#[embassy_executor::task]
pub async fn connection_task(
    mut controller: WifiController<'static>,
    stack: Stack<'static>,
    command_signal: &'static WifiCommandSignal,
    status_signal: &'static WifiStatusSignal,
) {
    println!("start connection task");
    println!("Device capabilities: {:?}", controller.capabilities());

    let mut current_state = WifiCommandSignalMessage::Connect;
    let mut was_connected = false;

    loop {
        Timer::after(Duration::from_millis(1000)).await;

        if let Some(signal) = command_signal.try_take() {
            current_state = signal;
        }

        if current_state == WifiCommandSignalMessage::Disconnect {
            if esp_wifi::wifi::wifi_state() != WifiState::StaDisconnected {
                match controller.disconnect_async().await {
                    Ok(_) => {
                        println!("Wifi disconnected!");
                        was_connected = false;
                        status_signal.signal(WifiStatusSignalMessage::Disconnected);
                    }
                    Err(e) => {
                        println!("Failed to disconnect from wifi: {e:?}");
                        Timer::after(Duration::from_millis(5000)).await
                    }
                }
            }
        }

        if current_state == WifiCommandSignalMessage::Connect {
            if esp_wifi::wifi::wifi_state() != WifiState::StaConnected {
                if was_connected {
                    println!("Wifi interrupted!");
                    was_connected = false;
                    status_signal.signal(WifiStatusSignalMessage::Interrupted);
                }

                if !matches!(controller.is_started(), Ok(true)) {
                    let config = esp_wifi::wifi::Configuration::Client(esp_wifi::wifi::ClientConfiguration {
                        ssid: SSID.try_into().unwrap(),
                        password: PASSWORD.try_into().unwrap(),
                        ..Default::default()
                    });

                    controller.set_configuration(&config).unwrap();
                    println!("Starting wifi");

                    controller.start_async().await.unwrap();
                    println!("Wifi started!");
                }

                println!("About to connect...");

                if let Err(err) = controller.connect_async().await {
                    println!("Failed to connect to wifi: {err:?}");
                    Timer::after(Duration::from_millis(5000)).await;
                    status_signal.signal(WifiStatusSignalMessage::Reset);
                    continue;
                }

                println!("Wifi connected!");
                was_connected = true;

                loop {
                    if let Some(ip_info) = stack.config_v4() {
                        println!("IP ADDRESS: {:?}", ip_info.address.address());
                        status_signal.signal(WifiStatusSignalMessage::Connected(ip_info.address.address()));

                        break;
                    }

                    Timer::after(Duration::from_millis(100)).await;
                }
            }
        }
    }
}
