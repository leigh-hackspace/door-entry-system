use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Timer};
use esp_println::println;
use esp_wifi::wifi::{WifiController, WifiState};

const SSID: &str = env!("SSID");
const PASSWORD: &str = env!("PASSWORD");

#[derive(PartialEq, Debug)]
pub enum WifiSignal {
    Connect,
    Disconnect,
}

// maintains wifi connection, when it disconnects it tries to reconnect
#[embassy_executor::task]
pub async fn connection_task(mut controller: WifiController<'static>, signal: &'static Signal<CriticalSectionRawMutex, WifiSignal>) {
    println!("start connection task");
    println!("Device capabilities: {:?}", controller.capabilities());

    let mut current_state = WifiSignal::Connect;

    controller.set_power_saving(esp_wifi::config::PowerSaveMode::None).unwrap();

    loop {
        Timer::after(Duration::from_millis(1000)).await;

        if let Some(signal) = signal.try_take() {
            current_state = signal;
        }

        if current_state == WifiSignal::Disconnect {
            if esp_wifi::wifi::wifi_state() != WifiState::StaDisconnected {
                match controller.disconnect_async().await {
                    Ok(_) => println!("Wifi disconnected!"),
                    Err(e) => {
                        println!("Failed to disconnect from wifi: {e:?}");
                        Timer::after(Duration::from_millis(5000)).await
                    }
                }
            }
        }

        if current_state == WifiSignal::Connect {
            if esp_wifi::wifi::wifi_state() != WifiState::StaConnected {
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

                match controller.connect_async().await {
                    Ok(_) => println!("Wifi connected!"),
                    Err(e) => {
                        println!("Failed to connect to wifi: {e:?}");
                        Timer::after(Duration::from_millis(5000)).await
                    }
                }
            }
        }
    }
}
