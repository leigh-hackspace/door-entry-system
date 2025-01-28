use crate::services::common::{MainPublisher, SystemMessage};
use crate::services::state::PermanentStateService;
use alloc::sync::Arc;
use core::marker::Sized;
use embassy_executor::Spawner;
use embassy_net::Stack;
use embassy_time::Duration;
use ota::HandleOtaUpdate;
use partitions_macro::partition_offset;
use picoserve::routing::{get_service, post};
use picoserve::{make_static, routing::get, AppBuilder, AppRouter};
use read_file::HandleFileRead;
use write_file::HandleFileWrite;

mod ota;
mod read_file;
mod write_file;

const OTA_0_OFFSET: u32 = partition_offset!("ota_0");
const OTA_1_OFFSET: u32 = partition_offset!("ota_1");
const OTA_OFFSETS: [u32; 2] = [OTA_0_OFFSET, OTA_1_OFFSET];

struct AppProps {
    publisher: MainPublisher,
    state_service: PermanentStateService,
}

impl AppBuilder for AppProps {
    type PathRouter = impl picoserve::routing::PathRouter;

    fn build_app(self) -> picoserve::Router<Self::PathRouter> {
        let publisher = make_static!(Arc<MainPublisher>, Arc::new(self.publisher));
        let state_service = make_static!(PermanentStateService, self.state_service.clone());

        picoserve::Router::new()
            .route(
                "/",
                get(|| async {
                    publisher.publish(SystemMessage::Ping).await;

                    if state_service.get_latch() {
                        "Latch On"
                    } else {
                        "Latch Off"
                    }

                    // "Door Entry [ESP32]"
                }),
            )
            .route(
                "/latch-on",
                post(|| async {
                    publisher.publish(SystemMessage::SetLatch(true)).await;
                }),
            )
            .route(
                "/latch-off",
                post(|| async {
                    publisher.publish(SystemMessage::SetLatch(false)).await;
                }),
            )
            .route("/file", get_service(HandleFileRead).post_service(HandleFileWrite))
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
    let mut tcp_rx_buffer = [0; 1024];
    let mut tcp_tx_buffer = [0; 1024];
    let mut http_buffer = [0; 2048];

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

pub fn start_http(spawner: Spawner, stack: Stack<'static>, publisher: MainPublisher, state_service: PermanentStateService) {
    let app = make_static!(AppRouter<AppProps>, AppProps { publisher, state_service }.build_app());

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
