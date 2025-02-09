use crate::{
    services::{
        common::{MainPublisher, SystemMessage},
        ota::Ota,
    },
    tasks::http::OTA_OFFSETS,
};
use alloc::{format, sync::Arc};
use embassy_time::{Duration, Timer};
use esp_hal::reset;
use esp_println::print;
use log::{info, warn};
use picoserve::{io::Read, response::IntoResponse};

pub struct HandleOtaUpdate {
    pub publisher: &'static Arc<MainPublisher>,
}

impl picoserve::routing::RequestHandlerService<()> for HandleOtaUpdate {
    async fn call_request_handler_service<R: Read, W: picoserve::response::ResponseWriter<Error = R::Error>>(
        &self,
        (): &(),
        (): (),
        mut request: picoserve::request::Request<'_, R>,
        response_writer: W,
    ) -> Result<picoserve::ResponseSent, W::Error> {
        self.publisher.publish(SystemMessage::OtaStarting).await;

        let mut storage = esp_storage::FlashStorage::new();
        let mut ota = Ota::new(&mut storage);

        let current_slot = ota.current_slot();
        info!("Current Slot: {:?}", current_slot);
        let new_slot = current_slot.next();
        info!("New Slot: {:?}", new_slot);

        let mut flash_addr = OTA_OFFSETS[new_slot.number()];

        let mut reader = request.body_connection.body().reader();
        let mut buffer = [0; esp_storage::FlashStorage::SECTOR_SIZE as usize];
        let mut total_size = 0;

        loop {
            let mut read_size = 0;

            // Make sure the buffer is full
            loop {
                let chunk_read_bytes = reader.read(&mut buffer[read_size..]).await?;
                read_size += chunk_read_bytes;
                if chunk_read_bytes == 0 {
                    break;
                }
            }

            if read_size == 0 {
                break;
            }

            ota.write(flash_addr, &buffer[..read_size]).unwrap();
            flash_addr += read_size as u32;

            print!(".");

            total_size += read_size;
        }

        ota.set_current_slot(new_slot);

        warn!("Restarting...");
        Timer::after(Duration::from_secs(5)).await;

        reset::software_reset();

        format!("Total Size: {total_size}\r\n")
            .write_to(request.body_connection.finalize().await?, response_writer)
            .await
    }
}
