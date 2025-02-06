use crate::services::common::{DeviceConfig, DeviceState, MainPublisher, SystemMessage};
use crate::services::state::PermanentStateService;
use crate::utils::local_fs::LocalFs;
use alloc::boxed::Box;
use alloc::format;
use alloc::string::ToString;
use alloc::sync::Arc;
use common::StringResponse;
use core::marker::Sized;
use delete_file::HandleFileDelete;
use embassy_executor::Spawner;
use embassy_net::Stack;
use embassy_time::Duration;
use esp_storage::FlashStorage;
use list_files::HandleFileList;
use ota::HandleOtaUpdate;
use partitions_macro::partition_offset;
use picoserve::routing::{get_service, post};
use picoserve::{make_static, routing::get, AppBuilder, AppRouter};
use play_file::HandleFilePlay;
use read_file::HandleFileRead;
use serde::Serialize;
use write_file::HandleFileWrite;

mod common;
mod delete_file;
mod list_files;
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
                "/stats",
                get(|| async {
                    let mut flash = FlashStorage::new();
                    let local_fs = LocalFs::new(&mut flash);

                    let fs_stats = local_fs.stats();

                    let clusters_total = fs_stats.as_ref().map_or_else(|err| 0, |stats| stats.total_clusters());
                    let clusters_free = fs_stats.as_ref().map_or_else(|err| 0, |stats| stats.free_clusters());

                    let heap_used = esp_alloc::HEAP.used() as u32;
                    let heap_free = esp_alloc::HEAP.free() as u32;

                    #[derive(Serialize)]
                    struct Stats {
                        clusters_used: u32,
                        clusters_free: u32,
                        heap_used: u32,
                        heap_free: u32,
                    }

                    let stats = Stats {
                        clusters_used: clusters_total - clusters_free,
                        clusters_free,
                        heap_used,
                        heap_free,
                    };

                    let json = serde_json_core::to_string::<Stats, 128>(&stats)
                        .map_or_else(|err| format!("\"{err:?}\"").into(), |json| json.to_string());

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
            .route("/files", get_service(HandleFileList))
            .route(
                "/file",
                get_service(HandleFileRead)
                    .post_service(HandleFileWrite { publisher })
                    .delete_service(HandleFileDelete {}),
            )
            .route("/play", get_service(HandleFilePlay { publisher }))
            .route(
                "/update",
                get_service(picoserve::response::File::html("<h1>Update</h1>")).post_service(HandleOtaUpdate { publisher }),
            )
    }
}

const WEB_TASK_POOL_SIZE: usize = 3;

#[embassy_executor::task(pool_size = WEB_TASK_POOL_SIZE)]
async fn web_task(id: usize, stack: Stack<'static>, app: &'static AppRouter<AppProps>, config: &'static picoserve::Config<Duration>) -> ! {
    let port = 80;
    let mut tcp_rx_buffer = Box::new([0; 1024]);
    let mut tcp_tx_buffer = Box::new([0; 1024]);
    let mut http_buffer = Box::new([0; 2048]);

    picoserve::listen_and_serve(
        id,
        app,
        config,
        stack,
        port,
        tcp_rx_buffer.as_mut_slice(),
        tcp_tx_buffer.as_mut_slice(),
        http_buffer.as_mut_slice(),
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
