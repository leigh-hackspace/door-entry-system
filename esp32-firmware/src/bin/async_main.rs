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
use core::{future::join, str::FromStr as _};
use embassy_executor::Spawner;
use embassy_net::{Config as NetConfig, DhcpConfig, Runner, Stack, StackResources};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, pubsub::WaitResult, signal::Signal};
use embassy_time::{Duration, Timer};
use esp_backtrace as _;
use esp_hal::{
    clock::CpuClock,
    rng::Rng,
    timer::{
        systimer::SystemTimer,
        timg::{MwdtStage, TimerGroup},
    },
};
use esp_println::print;
use esp_wifi::{
    ble::controller::BleConnector,
    wifi::{WifiDevice, WifiStaDevice},
    EspWifiController,
};
use log::{error, info, warn};
use services::{
    auth::{check_code, CheckCodeResult},
    common::{DeviceConfig, DeviceState, MainChannel, MainPublisher, SystemMessage, DEVICE_CONFIG_FILE_NAME, DEVICE_STATE_FILE_NAME},
    door::DoorService,
    http::HttpService,
    led::set_led,
    state::PermanentStateService,
};
use tasks::{
    audio::{audio_task, AudioSignal},
    ble::{self, ble_task},
    button::button_task,
    http::start_http,
    rfid::rfid_task,
    wifi::{connection_task, WifiSignal},
};

extern crate alloc;

const NOTIFY_URL: &str = env!("NOTIFY_URL");

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

    set_led(128, 0, 0).await;

    let systimer = SystemTimer::new(peripherals.SYSTIMER);
    esp_hal_embassy::init(systimer.alarm0);

    info!("Embassy initialized!");

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

    info!("Config initialized!");

    let timer_group_0 = TimerGroup::new(peripherals.TIMG0);
    let mut rng = Rng::new(peripherals.RNG);

    let wifi_init = &*make_static!(
        EspWifiController<'static>,
        esp_wifi::init(timer_group_0.timer0, rng.clone(), peripherals.RADIO_CLK).unwrap()
    );
    info!("WiFi inited!");

    let (wifi_interface, mut wifi_controller) = esp_wifi::wifi::new_with_mode(wifi_init, peripherals.WIFI, WifiStaDevice).unwrap();
    info!("WiFi newed!");

    wifi_controller.set_power_saving(esp_wifi::config::PowerSaveMode::None).unwrap();

    let dhcp_name = &config_service.get_data().name.replace(" ", "-");

    let mut dhcp_config = DhcpConfig::default();
    dhcp_config.hostname = Some(heapless::String::from_str(dhcp_name).unwrap());
    let net_config = NetConfig::dhcpv4(dhcp_config);
    info!("DHCP configured!");

    let seed = (rng.random() as u64) << 32 | rng.random() as u64;

    let (stack, runner) = embassy_net::new(
        wifi_interface,
        net_config,
        make_static!(StackResources<6>, StackResources::<6>::new()),
        seed,
    );
    info!("Network stack newed!");

    set_led(0, 0, 128).await;

    let mut wdt = timer_group_0.wdt;
    wdt.set_timeout(MwdtStage::Stage0, esp_hal::time::Duration::from_millis(30_000));
    wdt.enable();

    let channel = make_static!(MainChannel, MainChannel::new());

    let wifi_signal = make_static!(Signal::<CriticalSectionRawMutex, WifiSignal>, Signal::new());
    let audio_signal = make_static!(Signal::<CriticalSectionRawMutex, AudioSignal>, Signal::new());

    let bluetooth = peripherals.BT;
    let connector = BleConnector::new(&wifi_init, bluetooth);

    spawner
        .spawn(ble_task(connector, config_service.clone(), channel.publisher().unwrap()))
        .ok();
    spawner.spawn(rfid_task(channel.publisher().unwrap())).ok();
    spawner.spawn(net_task(runner)).ok();
    spawner.spawn(connection_task(wifi_controller, wifi_signal)).ok();
    spawner.spawn(button_task(channel.publisher().unwrap())).ok();
    spawner.spawn(audio_task(audio_signal)).ok();
    spawner.spawn(watchdog_task(stack, channel.publisher().unwrap())).ok();

    wifi_signal.signal(WifiSignal::Connect);

    info!("Hello Number: {}", unsafe { utils::ctest::hello_number() });

    let mut door_service = DoorService::new(state_service.clone(), audio_signal);
    let http_service = HttpService::new(stack);

    let push_announce = async || {
        for _ in 0..10 {
            if let Err(err) = http_service
                .do_http_request(
                    NOTIFY_URL.to_string() + "/announce",
                    format!(r#"{{"name":"{}"}}"#, config_service.get_data().name),
                )
                .await
            {
                warn!("push_announce: Could not communicate with server! {:?}", err);
                Timer::after(Duration::from_millis(1_000)).await;
            } else {
                info!("push_announce: Success");
                return;
            }
        }
    };

    let push_code = async |code: String, allowed: bool| {
        if let Err(err) = http_service
            .do_http_request(
                NOTIFY_URL.to_string() + "/code",
                format!(r#"{{"code":"{}","allowed":{}}}"#, code, if allowed { "true" } else { "false" }),
            )
            .await
        {
            warn!("push_code: Could not communicate with server! {:?}", err);
        } else {
            info!("push_code: Success: {} {}", code, allowed);
        }
    };

    let push_state = async || {
        if let Err(err) = http_service
            .do_http_request(
                NOTIFY_URL.to_string() + "/state",
                state_service.get_json().map(|s| s.to_string()).unwrap_or("{}".to_string()),
            )
            .await
        {
            warn!("push_state: Could not communicate with server! {:?}", err);
        } else {
            info!("push_state: Success");
        }
    };

    start_http(
        spawner,
        stack,
        channel.publisher().unwrap(),
        config_service.clone(),
        state_service.clone(),
    );

    let main_publisher = channel.publisher().unwrap();
    let mut main_subscriber = channel.subscriber().unwrap();

    let mut last_seen = esp_hal::time::Instant::now().duration_since_epoch().as_micros();

    let state_change_loop = async {
        loop {
            door_service.changed_signal.wait().await;
            push_state().await;
        }
    };

    let main_message_loop = async {
        loop {
            if let WaitResult::Message(msg) = main_subscriber.next_message().await {
                if msg != SystemMessage::Ping && msg != SystemMessage::Watchdog {
                    info!("#### SystemMessage: {:?}", msg);
                }

                match msg {
                    SystemMessage::ConnectionAvailable => {
                        audio_signal.signal(AudioSignal::Play("startup.mp3".to_string()));

                        push_announce().await;
                    }
                    SystemMessage::CodeDetected(code) => {
                        let mut allowed = false;

                        match check_code(&code).await {
                            Ok(result) => match result {
                                CheckCodeResult::Valid(name) => {
                                    info!("Welcome {}", name);
                                    main_publisher.publish(SystemMessage::Authorised).await;
                                    allowed = true;
                                }
                                CheckCodeResult::Invalid => {
                                    main_publisher.publish(SystemMessage::Denied).await;
                                }
                            },
                            Err(err) => {
                                error!("CheckCode: {:?}", err);
                                main_publisher.publish(SystemMessage::Denied).await;
                            }
                        }

                        push_code(code, allowed).await;
                    }
                    SystemMessage::Authorised => door_service.open_door().await,
                    SystemMessage::Denied => audio_signal.signal(AudioSignal::Play("failure.mp3".to_string())),
                    SystemMessage::ButtonPressed => door_service.open_door().await,
                    SystemMessage::ButtonLongPressed => door_service.toggle_latch(),
                    SystemMessage::WifiOff => wifi_signal.signal(WifiSignal::Disconnect),
                    SystemMessage::Watchdog => {
                        let now = esp_hal::time::Instant::now().duration_since_epoch().as_micros();
                        let last_seen_ago = now - last_seen;

                        // info!("Last ping: {} seconds ago", last_seen_ago / 1_000_000);

                        if last_seen_ago < 5 * 60_000_000 {
                            // Keep feeding the watchdog if we've received a recent ping
                            wdt.feed();
                        } else {
                            // Let the watchdog restart the system by NOT feeding it...
                            error!("Not been pinged in over 5 minutes. Restarting!!!");
                        }
                    }
                    SystemMessage::Ping => {
                        print!(".");
                        last_seen = esp_hal::time::Instant::now().duration_since_epoch().as_micros();
                    }
                    SystemMessage::OtaStarting => {
                        let started = esp_hal::time::Instant::now().duration_since_epoch().as_micros();

                        loop {
                            let now = esp_hal::time::Instant::now().duration_since_epoch().as_micros();
                            let started_ago = now - started;

                            if started_ago > 5 * 60_000_000 {
                                error!("OTA failed. Waited 5 minutes. Restarting!!!");
                                return;
                            }

                            info!("Ota is happening... {} seconds so far", started_ago / 1_000_000);
                            wdt.feed();

                            Timer::after(Duration::from_millis(10_000)).await;
                        }
                    }
                    SystemMessage::HandleLatchFromServer(latch) => door_service.set_latch(latch),
                    SystemMessage::PlayFile(file) => audio_signal.signal(AudioSignal::Play(file)),
                }
            };
        }
    };

    join!(main_message_loop, state_change_loop).await;
}

// A background task, to process network events - when new packets, they need to processed, embassy-net, wraps smoltcp
#[embassy_executor::task]
async fn net_task(mut runner: Runner<'static, WifiDevice<'static, WifiStaDevice>>) {
    runner.run().await
}

#[embassy_executor::task]
async fn watchdog_task(stack: Stack<'static>, publisher: MainPublisher) {
    let mut shown_ip = false;

    loop {
        // info!("{}", esp_alloc::HEAP.stats());

        if !shown_ip {
            if let Some(ip_info) = stack.config_v4() {
                shown_ip = true;
                info!("IP ADDRESS: {:?}", ip_info.address.address());

                publisher.publish(SystemMessage::ConnectionAvailable).await;
            }
        }

        publisher.publish(SystemMessage::Watchdog).await;

        Timer::after(Duration::from_millis(5_000)).await;
    }
}
