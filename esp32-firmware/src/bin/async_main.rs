#![no_std]
#![no_main]
#![feature(impl_trait_in_assoc_type)]
#![feature(addr_parse_ascii)]
#![feature(type_alias_impl_trait)]

mod services;
mod tasks;
mod utils;

use alloc::boxed::Box;
use alloc::format;
use alloc::string::ToString;
use core::str::FromStr;
use embassy_executor::Spawner;
use embassy_net::{Config as NetConfig, Runner, Stack};
use embassy_net::{DhcpConfig, StackResources};
use embassy_sync::blocking_mutex::raw::CriticalSectionRawMutex;
use embassy_sync::pubsub::WaitResult;
use embassy_sync::signal::Signal;
use embassy_time::{Duration, Timer};
use esp_backtrace as _;
use esp_hal::peripherals::Peripherals;
use esp_hal::prelude::*;
use esp_hal::timer::timg::MwdtStage;
use esp_println::print;
use esp_storage::FlashStorage;
use esp_wifi::ble::controller::BleConnector;
use esp_wifi::wifi::{self, WifiDevice, WifiStaDevice};
use log::{error, info, warn};
use services::auth::check_code;
use services::common::{MainChannel, MainPublisher, MainSubscriber, SystemMessage};
use services::door::DoorService;
use services::http::HttpService;
use services::state::PermanentStateService;
use static_cell::StaticCell;
use tasks::audio::{audio_task, AudioSignal};
use tasks::ble::ble_task;
use tasks::button::button_task;
use tasks::http::start_http;
use tasks::rfid::rfid_task;
use tasks::wifi::{connection_task, WifiSignal};
use utils::local_fs::{self, LocalFs};

extern crate alloc;

const NOTIFY_URL: &str = env!("NOTIFY_URL");
const SEED: u64 = 8472;

/// Replacement for [`static_cell::make_static`](https://docs.rs/static_cell/latest/static_cell/macro.make_static.html) for use cases when the type is known.
#[macro_export]
macro_rules! make_static {
    ($t:ty, $val:expr) => ($crate::make_static!($t, $val,));
    ($t:ty, $val:expr, $(#[$m:meta])*) => {{
        $(#[$m])*
        static STATIC_CELL: static_cell::StaticCell<$t> = static_cell::StaticCell::new();
        STATIC_CELL.init($val)
    }};
}
#[main]
async fn main(spawner: Spawner) {
    let peripherals = esp_hal::init({
        let mut config = esp_hal::Config::default();
        config.cpu_clock = CpuClock::max();
        config
    });

    // esp_alloc::heap_allocator!(72 * 1024);

    #[link_section = ".dram2_uninit"]
    static mut HEAP2: core::mem::MaybeUninit<[u8; 72 * 1024]> = core::mem::MaybeUninit::uninit();

    unsafe {
        esp_alloc::HEAP.add_region(esp_alloc::HeapRegion::new(
            HEAP2.as_mut_ptr() as *mut u8,
            core::mem::size_of_val(&*core::ptr::addr_of!(HEAP2)),
            esp_alloc::MemoryCapability::Internal.into(),
        ));
    }

    esp_println::logger::init_logger_from_env();

    let timer_group_1 = esp_hal::timer::timg::TimerGroup::new(peripherals.TIMG1);
    esp_hal_embassy::init(timer_group_1.timer0);

    info!("Embassy initialized!");

    let timer_group_0 = esp_hal::timer::timg::TimerGroup::new(peripherals.TIMG0);

    let wifi_init = Box::leak::<'static>(Box::new(
        esp_wifi::init(timer_group_0.timer0, esp_hal::rng::Rng::new(peripherals.RNG), peripherals.RADIO_CLK).unwrap(),
    ));

    let (wifi_interface, wifi_controller) = wifi::new_with_mode(wifi_init, peripherals.WIFI, WifiStaDevice).unwrap();

    let mut dhcp_config = DhcpConfig::default();
    dhcp_config.hostname = Some(heapless::String::from_str("esp32-experiment").unwrap());
    let net_config = NetConfig::dhcpv4(dhcp_config);

    static RESOURCES: StaticCell<StackResources<4>> = StaticCell::new(); // Increase this if you start getting socket ring errors.

    let (stack, runner) = embassy_net::new(wifi_interface, net_config, RESOURCES.init(StackResources::new()), SEED);

    let mut wdt = timer_group_1.wdt;

    wdt.set_timeout(MwdtStage::Stage0, 30_000.millis());
    wdt.enable();

    // List files for debug
    let mut flash = FlashStorage::new();
    let local_fs = LocalFs::new(&mut flash);
    local_fs.dir();
    drop(local_fs);
    drop(flash);

    let channel = make_static!(MainChannel, MainChannel::new());

    let wifi_signal = make_static!(Signal::<CriticalSectionRawMutex, WifiSignal>, Signal::new());
    let audio_signal = make_static!(Signal::<CriticalSectionRawMutex, AudioSignal>, Signal::new());

    let _ = spawner;

    // let bluetooth = unsafe { Peripherals::steal() }.BT;

    // spawner
    //     .spawn(ble_task(BleConnector::new(wifi_init, bluetooth), channel.publisher().unwrap()))
    //     .ok();
    spawner.spawn(rfid_task(channel.publisher().unwrap())).ok();
    spawner.spawn(net_task(runner)).ok();
    spawner.spawn(connection_task(wifi_controller, wifi_signal)).ok();
    spawner.spawn(button_task(channel.publisher().unwrap())).ok();
    spawner.spawn(audio_task(audio_signal)).ok();
    spawner.spawn(watchdog_task(stack, channel.publisher().unwrap())).ok();

    wifi_signal.signal(WifiSignal::Connect);

    let mut door_service = DoorService::new();
    let mut state_service = PermanentStateService::new();
    let http_service = HttpService::new(stack);

    if let Err(err) = state_service.init() {
        error!("State Init Error: {:?}", err);
    }

    start_http(spawner, stack, channel.publisher().unwrap(), state_service.clone());

    door_service.set_latch(state_service.get_latch());

    let main_publisher = channel.publisher().unwrap();
    let mut main_subscriber: MainSubscriber = channel.subscriber().unwrap();

    audio_signal.signal(AudioSignal::Play("startup.wav".to_string()));

    let mut last_seen = esp_hal::time::now().ticks();

    loop {
        if let WaitResult::Message(msg) = main_subscriber.next_message().await {
            if msg != SystemMessage::Ping && msg != SystemMessage::Watchdog {
                info!("==== SystemMessage: {:?}", msg);
            }

            match msg {
                SystemMessage::CodeDetected(code) => {
                    let mut allowed = false;

                    match check_code(&code).await {
                        Ok(result) => match result {
                            services::auth::CheckCodeResult::Valid(name) => {
                                info!("Welcome {}", name);
                                main_publisher.publish(SystemMessage::Authorised).await;
                                allowed = true;
                            }
                            services::auth::CheckCodeResult::Invalid => {
                                main_publisher.publish(SystemMessage::Denied).await;
                            }
                        },
                        Err(err) => {
                            error!("CheckCode: {:?}", err);
                            main_publisher.publish(SystemMessage::Denied).await;
                        }
                    }

                    if let Err(err) = http_service
                        .do_http_request(
                            NOTIFY_URL.to_string(),
                            format!(r#"{{"code":"{}","allowed":{}}}"#, code, if allowed { "true" } else { "false" }),
                        )
                        .await
                    {
                        warn!("Could not communicate with server! {:?}", err);
                    }
                }
                SystemMessage::Authorised => {
                    info!("Authorised");

                    audio_signal.signal(AudioSignal::Play("success.wav".to_string()));
                    Timer::after(Duration::from_millis(1500)).await;

                    if state_service.get_latch() {
                        continue;
                    }

                    door_service.release_door_lock();
                    audio_signal.signal(AudioSignal::Play("open.wav".to_string()));

                    Timer::after(Duration::from_millis(5000)).await;

                    audio_signal.signal(AudioSignal::Play("close.wav".to_string()));
                    door_service.set_door_lock();
                }
                SystemMessage::Denied => {
                    info!("Denied");

                    audio_signal.signal(AudioSignal::Play("failure.wav".to_string()));
                }
                SystemMessage::ButtonPressed => {
                    if state_service.get_latch() {
                        continue;
                    }

                    door_service.release_door_lock();
                    audio_signal.signal(AudioSignal::Play("open.wav".to_string()));

                    Timer::after(Duration::from_millis(5000)).await;

                    audio_signal.signal(AudioSignal::Play("close.wav".to_string()));
                    door_service.set_door_lock();
                }
                SystemMessage::ButtonLongPressed => {
                    let latch = state_service.toggle_latch();

                    door_service.set_latch(latch);

                    audio_signal.signal(AudioSignal::Play(if latch {
                        "latchon.wav".to_string()
                    } else {
                        "latchoff.wav".to_string()
                    }));

                    if let Err(err) = state_service.save() {
                        error!("Error saving state: {:?}", err);
                    }
                }
                SystemMessage::WifiOff => {
                    wifi_signal.signal(WifiSignal::Disconnect);
                }
                SystemMessage::Watchdog => {
                    let now = esp_hal::time::now().ticks();
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
                    last_seen = esp_hal::time::now().ticks();
                }
                SystemMessage::OtaStarting => {
                    let started = esp_hal::time::now().ticks();

                    loop {
                        let now = esp_hal::time::now().ticks();
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
                SystemMessage::SetLatch(latch) => {
                    state_service.set_latch(latch);

                    door_service.set_latch(latch);

                    if let Err(err) = state_service.save() {
                        error!("Error saving state: {:?}", err);
                    }

                    audio_signal.signal(AudioSignal::Play(if latch {
                        "latchon.wav".to_string()
                    } else {
                        "latchoff.wav".to_string()
                    }));
                }
            }
        };
    }
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
        if !shown_ip {
            if let Some(ip_info) = stack.config_v4() {
                shown_ip = true;
                info!("IP ADDRESS: {:?}", ip_info.address.address());
            }
        }

        publisher.publish(SystemMessage::Watchdog).await;
        print!(".");

        Timer::after(Duration::from_millis(10_000)).await;
    }
}
