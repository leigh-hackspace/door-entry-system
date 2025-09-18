#![no_std]
#![no_main]
#![feature(addr_parse_ascii)]
#![feature(impl_trait_in_assoc_type)]
#![feature(future_join)]

mod services;
mod tasks;
mod utils;

use alloc::{
    format,
    string::{String, ToString as _},
};
use core::{cell::RefCell, future::join, str::FromStr as _};
use embassy_executor::Spawner;
use embassy_net::{Config as NetConfig, DhcpConfig, Runner, StackResources};
use embassy_sync::pubsub::WaitResult;
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Timer};
use esp_backtrace as _;
use esp_hal::{
    clock::CpuClock,
    rng::Rng,
    time::Instant,
    timer::{
        systimer::SystemTimer,
        timg::{MwdtStage, TimerGroup},
    },
};
use esp_hal::{
    gpio::{self, OutputConfig},
    peripheral::Peripheral as _,
};
use esp_wifi::{
    ble::controller::BleConnector,
    wifi::{WifiDevice, WifiStaDevice},
    EspWifiController,
};
use log::{error, info, warn};
use services::{
    auth::{check_code, CheckCodeResult},
    common::{DeviceConfig, DeviceState, MainChannel, SystemMessage, DEVICE_CONFIG_FILE_NAME, DEVICE_STATE_FILE_NAME, NOTIFY_URL, VERSION},
    door::DoorService,
    http::HttpService,
    led::LedService,
    state::PermanentStateService,
};
use tasks::{
    audio::{audio_task, AudioSignal},
    ble::ble_task,
    button::{button_task, ButtonSignal, ButtonSignalMessage},
    http::start_http,
    led::{led_task, LedSignal},
    rfid::{rfid_task, RfidSignal, RfidSignalMessage},
    wifi::{connection_task, WifiCommandSignal, WifiCommandSignalMessage, WifiStatusSignal, WifiStatusSignalMessage},
};

use crate::utils::HardResetPins;

extern crate alloc;

#[esp_hal_embassy::main]
async fn main(spawner: Spawner) {
    let config = esp_hal::Config::default().with_cpu_clock(CpuClock::max());
    let peripherals = esp_hal::init(config);

    esp_alloc::heap_allocator!(96 * 1024);

    #[link_section = ".dram2_uninit"]
    static mut HEAP2: core::mem::MaybeUninit<[u8; 64 * 1024]> = core::mem::MaybeUninit::uninit();

    unsafe {
        // COEX needs more RAM - add some more
        esp_alloc::HEAP.add_region(esp_alloc::HeapRegion::new(
            HEAP2.as_mut_ptr() as *mut u8,
            core::mem::size_of_val(&*core::ptr::addr_of!(HEAP2)),
            esp_alloc::MemoryCapability::Internal.into(),
        ));
    }

    esp_println::logger::init_logger_from_env();

    let systimer = SystemTimer::new(peripherals.SYSTIMER);
    esp_hal_embassy::init(systimer.alarm0);

    let mut led_service = LedService::new();

    led_service.send(255, 0, 0).await;

    info!("Embassy initialized! Version: {VERSION}");

    let timer_group_0 = TimerGroup::new(peripherals.TIMG0);

    let mut wdt = timer_group_0.wdt;
    wdt.set_timeout(MwdtStage::Stage0, esp_hal::time::Duration::from_millis(30_000));
    wdt.enable();

    let default_device_config = DeviceConfig {
        name: "Unnamed ESP32".try_into().unwrap(),
    };
    let default_device_state = DeviceState { latch: false };

    let mut config_service = PermanentStateService::new(DEVICE_CONFIG_FILE_NAME.to_string(), default_device_config);
    let mut state_service = PermanentStateService::new(DEVICE_STATE_FILE_NAME.to_string(), default_device_state);

    if let Err(err) = config_service.init() {
        error!("Config Service failed to initialised! {err:?}");
    }
    if let Err(err) = state_service.init() {
        error!("State Service failed to initialised! {err:?}");
    }

    let mut reset = gpio::Output::new(HardResetPins::new().reset, gpio::Level::High, OutputConfig::default());
    reset.set_high();

    info!("Config initialized!");

    let mut rng = Rng::new(peripherals.RNG);

    let wifi_init = &*make_static!(
        EspWifiController<'static>,
        esp_wifi::init(timer_group_0.timer0, rng.clone(), peripherals.RADIO_CLK).unwrap()
    );

    let (wifi_int, mut wifi_cont) = esp_wifi::wifi::new_with_mode(wifi_init, peripherals.WIFI, WifiStaDevice).unwrap();

    wifi_cont.set_power_saving(esp_wifi::config::PowerSaveMode::None).unwrap();

    let dhcp_name = &config_service.get_data().name.replace(" ", "-");

    let mut dhcp_config = DhcpConfig::default();
    dhcp_config.hostname = Some(heapless::String::from_str(dhcp_name).unwrap());
    let net_config = NetConfig::dhcpv4(dhcp_config);

    let seed = (rng.random() as u64) << 32 | rng.random() as u64;

    let (stack, runner) = embassy_net::new(wifi_int, net_config, make_static!(StackResources<6>, StackResources::<6>::new()), seed);

    led_service.send(0, 255, 0).await;

    drop(led_service);

    let channel = make_static!(MainChannel, MainChannel::new());

    let rfid_signal = make_static!(RfidSignal, Signal::new());
    let button_signal = make_static!(ButtonSignal, Signal::new());
    let wifi_command_signal = make_static!(WifiCommandSignal, Signal::new());
    let wifi_status_signal = make_static!(WifiStatusSignal, Signal::new());
    let audio_signal = make_static!(Signal::<CriticalSectionRawMutex, AudioSignal>, Signal::new());
    let led_signal = make_static!(Signal::<CriticalSectionRawMutex, LedSignal>, Signal::new());

    let connector = BleConnector::new(&wifi_init, peripherals.BT);

    spawner.spawn(net_task(runner)).ok();
    spawner.spawn(ble_task(connector, config_service.clone(), button_signal)).ok();
    spawner.spawn(rfid_task(rfid_signal)).ok();
    spawner.spawn(button_task(button_signal)).ok();
    spawner.spawn(connection_task(wifi_cont, stack, wifi_command_signal, wifi_status_signal)).ok();
    spawner.spawn(audio_task(audio_signal)).ok();
    spawner.spawn(led_task(led_signal)).ok();

    wifi_command_signal.signal(WifiCommandSignalMessage::Connect);

    let door_service = DoorService::new(state_service.clone(), audio_signal);
    let http_service = HttpService::new(stack);

    let push_announce = async || {
        let data = format!(r#"{{"name":"{}"}}"#, config_service.get_data().name);

        if let Ok(_) = http_service.do_http_request_with_retry(NOTIFY_URL.to_string() + "/announce", data).await {
            info!("push_announce: Success");
        }
    };

    let push_code = async |code: String, allowed: bool| {
        let data = format!(r#"{{"code":"{}","allowed":{}}}"#, code, if allowed { "true" } else { "false" });

        if let Ok(_) = http_service.do_http_request_with_retry(NOTIFY_URL.to_string() + "/code", data).await {
            info!("push_code: Success: {} {}", code, allowed);
        }
    };

    let push_state = async || {
        // If online...
        if let Some(_) = stack.config_v4() {
            let data = state_service.get_json().map(|s| s.to_string()).unwrap_or("{}".to_string());

            if let Ok(_) = http_service.do_http_request_with_retry(NOTIFY_URL.to_string() + "/state", data).await {
                info!("push_state: Success");
            }
        }
    };

    let flash_leds = |status: u8| {
        if status == 0 {
            led_signal.signal(LedSignal::Flash(255, 0, 0, 5, 250));
        } else {
            led_signal.signal(LedSignal::Flash(0, 255, 0, 5, 250));
        }
    };

    let handle_code = async |code: String| {
        let mut allowed = false;

        match check_code(&code).await {
            Ok(result) => match result {
                CheckCodeResult::Valid(name) => {
                    info!("Welcome {}", name);
                    flash_leds(1);
                    door_service.open_door("success.mp3".to_string()).await;
                    allowed = true;
                }
                CheckCodeResult::Invalid => {
                    flash_leds(0);
                    audio_signal.signal(AudioSignal::Play("failure.mp3".to_string()));
                }
            },
            Err(err) => {
                error!("CheckCode: {:?}", err);
                audio_signal.signal(AudioSignal::Play("failure.mp3".to_string()));
            }
        }

        push_code(code, allowed).await;
    };

    let last_seen = RefCell::new(Instant::now().duration_since_epoch().as_millis());
    let rfid_last_seen = RefCell::new(Instant::now().duration_since_epoch().as_millis());
    let ota_happening = RefCell::new(false);

    start_http(spawner, stack, channel.publisher().unwrap(), config_service.clone(), state_service.clone());

    join!(
        async {
            let mut reset = unsafe { reset.clone_unchecked() };

            loop {
                let now = Instant::now().duration_since_epoch().as_millis();

                // Make sure OTA gets at least 10 minutes to complete
                let timeout = if *ota_happening.borrow() { 10 * 60_000 } else { 2 * 60_000 };

                let last_seen_ago = now - *last_seen.borrow();
                let rfid_last_seen_ago = now - *rfid_last_seen.borrow();

                // info!("Last ping: {} seconds ago", last_seen_ago / 1_000);

                if last_seen_ago < timeout && rfid_last_seen_ago < timeout {
                    // Keep feeding the watchdog if we've received a recent ping
                    wdt.feed();
                } else {
                    // Let the watchdog restart the system by NOT feeding it...
                    error!("Not been pinged in over 5 minutes. Restarting!!!");
                    reset.set_low();
                }

                Timer::after(Duration::from_millis(5_000)).await;
            }
        },
        async {
            loop {
                door_service.changed_signal.wait().await;
                push_state().await;
            }
        },
        async {
            let mut reset = unsafe { reset.clone_unchecked() };

            loop {
                match wifi_status_signal.wait().await {
                    WifiStatusSignalMessage::Connected(ip_address) => {
                        led_signal.signal(LedSignal::Set(0, 0, 255));
                        audio_signal.signal(AudioSignal::Play("startup.mp3".to_string()));
                        push_announce().await;
                    }
                    WifiStatusSignalMessage::Interrupted => {}
                    WifiStatusSignalMessage::Disconnected => {}
                    WifiStatusSignalMessage::Reset => {
                        info!("==== HARD RESET ====");
                        reset.set_low();
                    }
                }
            }
        },
        async {
            loop {
                match rfid_signal.wait().await {
                    RfidSignalMessage::Ping => *rfid_last_seen.borrow_mut() = Instant::now().duration_since_epoch().as_millis(),
                    RfidSignalMessage::CodeDetected(code) => handle_code(code).await,
                }
            }
        },
        async {
            loop {
                match button_signal.wait().await {
                    ButtonSignalMessage::ButtonPressed => door_service.open_door("open.mp3".to_string()).await,
                    ButtonSignalMessage::ButtonLongPressed => door_service.toggle_latch(),
                }
            }
        },
        async {
            let mut reset = unsafe { reset.clone_unchecked() };
            let mut main_subscriber = channel.subscriber().unwrap();

            loop {
                if let WaitResult::Message(msg) = main_subscriber.next_message().await {
                    if msg != SystemMessage::Ping {
                        info!("#### SystemMessage: {:?}", msg);
                    }

                    match msg {
                        SystemMessage::WifiOff => wifi_command_signal.signal(WifiCommandSignalMessage::Disconnect),
                        SystemMessage::Ping => *last_seen.borrow_mut() = Instant::now().duration_since_epoch().as_millis(),
                        SystemMessage::HandleLatchFromServer(latch) => door_service.set_latch(latch),
                        SystemMessage::PlayFile(file) => audio_signal.signal(AudioSignal::Play(file)),
                        SystemMessage::OtaStarting => *ota_happening.borrow_mut() = true,
                        SystemMessage::OtaComplete => {
                            warn!("Restarting...");
                            reset.set_low();

                            Timer::after(Duration::from_secs(5)).await;
                            esp_hal::system::software_reset()
                        }
                        SystemMessage::HardReset => {
                            warn!("Restarting...");
                            reset.set_low();
                        }
                    }
                };
            }
        },
    )
    .await;
}

// A background task, to process network events - when new packets, they need to processed, embassy-net, wraps smoltcp
#[embassy_executor::task]
async fn net_task(mut runner: Runner<'static, WifiDevice<'static, WifiStaDevice>>) {
    runner.run().await
}
