use crate::services::common::{DeviceConfig, DeviceState, MainPublisher, SystemMessage};
use crate::services::state::PermanentStateService;
use alloc::format;
use alloc::string::ToString;
use alloc::sync::Arc;
use common::StringResponse;
use core::marker::Sized;
use embassy_executor::Spawner;
use embassy_net::Stack;
use embassy_time::Duration;
use ota::HandleOtaUpdate;
use partitions_macro::partition_offset;
use picoserve::routing::{get_service, post};
use picoserve::{make_static, routing::get, AppBuilder, AppRouter};
use play_file::HandleFilePlay;
use read_file::HandleFileRead;
use write_file::HandleFileWrite;

mod common;
mod ota;
mod play_file;
mod read_file;
mod write_file;

const OTA_0_OFFSET: u32 = partition_offset!("ota_0");
const OTA_1_OFFSET: u32 = partition_offset!("ota_1");
const OTA_OFFSETS: [u32; 2] = [OTA_0_OFFSET, OTA_1_OFFSET];

struct AppProps {
    publisher: MainPublisher,
    config_service: PermanentStateService<DeviceConfig>,
    state_service: PermanentStateService<DeviceState>,
}

impl AppBuilder for AppProps {
    type PathRouter = impl picoserve::routing::PathRouter;

    fn build_app(self) -> picoserve::Router<Self::PathRouter> {
        let publisher = make_static!(Arc<MainPublisher>, Arc::new(self.publisher));
        let config_service = make_static!(PermanentStateService<DeviceConfig>, self.config_service.clone());
        let state_service = make_static!(PermanentStateService<DeviceState>, self.state_service.clone());

        picoserve::Router::new()
            .route(
                "/",
                get(|| async {
                    publisher.publish(SystemMessage::Ping).await;

                    let json = format!(
                        "[{},{}]",
                        config_service
                            .get_json()
                            .map(|str| str.to_string())
                            .unwrap_or_else(|err| format!("\"{err:?}\"").try_into().unwrap()),
                        state_service
                            .get_json()
                            .map(|str| str.to_string())
                            .unwrap_or_else(|err| format!("\"{err:?}\"").try_into().unwrap()),
                    );

                    StringResponse { str: json }
                }),
            )
            .route(
                "/latch-on",
                post(|| async {
                    publisher.publish(SystemMessage::HandleLatchFromServer(true)).await;
                }),
            )
            .route(
                "/latch-off",
                post(|| async {
                    publisher.publish(SystemMessage::HandleLatchFromServer(false)).await;
                }),
            )
            .route("/file", get_service(HandleFileRead).post_service(HandleFileWrite))
            .route("/play", get_service(HandleFilePlay { publisher }))
            .route(
                "/update",
                get_service(picoserve::response::File::html("<h1>Update</h1>")).post_service(HandleOtaUpdate { publisher }),
            )
    }
}

const WEB_TASK_POOL_SIZE: usize = 1;

#[embassy_executor::task(pool_size = WEB_TASK_POOL_SIZE)]
async fn web_task(id: usize, stack: Stack<'static>, app: &'static AppRouter<AppProps>, config: &'static picoserve::Config<Duration>) -> ! {
    let port = 80;
    let mut tcp_rx_buffer = [0; 512];
    let mut tcp_tx_buffer = [0; 512];
    let mut http_buffer = [0; 1024];

    picoserve::listen_and_serve(
        id,
        app,
        config,
        stack,
        port,
        &mut tcp_rx_buffer,
        &mut tcp_tx_buffer,
        &mut http_buffer,
    )
    .await
}

pub fn start_http(
    spawner: Spawner,
    stack: Stack<'static>,
    publisher: MainPublisher,
    config_service: PermanentStateService<DeviceConfig>,
    state_service: PermanentStateService<DeviceState>,
) {
    let app = make_static!(
        AppRouter<AppProps>,
        AppProps {
            publisher,
            config_service,
            state_service,
        }
        .build_app()
    );

    let config = make_static!(
        picoserve::Config<Duration>,
        picoserve::Config::new(picoserve::Timeouts {
            start_read_request: Some(Duration::from_secs(5)),
            read_request: Some(Duration::from_secs(1)),
            write: Some(Duration::from_secs(1)),
        }) // .keep_connection_alive()
    );

    for id in 0..WEB_TASK_POOL_SIZE {
        spawner.must_spawn(web_task(id, stack, app, config));
    }
}
