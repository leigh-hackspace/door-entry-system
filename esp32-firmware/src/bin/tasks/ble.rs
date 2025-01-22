use crate::{
    services::common::{MainPublisher, SystemMessage},
    utils::local_fs::LocalFs,
};
use alloc::borrow::ToOwned;
use bleps::{
    ad_structure::{create_advertising_data, AdStructure, BR_EDR_NOT_SUPPORTED, LE_GENERAL_DISCOVERABLE},
    async_attribute_server::AttributeServer,
    asynch::Ble,
    attribute_server::NotificationData,
    gatt,
};
use core::cell::RefCell;
use embassy_time::{Duration, Timer};
use esp_alloc as _;
use esp_backtrace as _;
use esp_hal::{
    gpio::{self},
    peripherals::Peripherals,
    time,
};
use esp_println::println;
use esp_storage::FlashStorage;
use esp_wifi::ble::controller::BleConnector;
use log::info;

// TODO: Figure out how to use constants...
static SERVICE_ID: &str = "10000000-0000-0000-0000-000000008472";
static CHAR_ID: &str = "20000000-0000-0000-0000-000000008472";

#[embassy_executor::task]
pub async fn ble_task(connector: BleConnector<'static>, publisher: MainPublisher) -> ! {
    Timer::after(Duration::from_millis(5_000)).await;
    info!("BLE Task Started");

    let peripherals = unsafe { Peripherals::steal() };

    let button = gpio::Input::new(peripherals.GPIO0, gpio::Pull::Down);

    let now = || time::now().duration_since_epoch().to_millis();
    let mut ble = Ble::new(connector, now);

    let pin_ref = RefCell::new(button);
    let pin_ref = &pin_ref;

    let mut flash = FlashStorage::new();
    let local_fs = LocalFs::new(&mut flash);

    let name = local_fs.read_text_file("name.txt").unwrap_or("Unnamed ESP32".to_owned());

    loop {
        println!("{:?}", ble.init().await);
        println!("{:?}", ble.cmd_set_le_advertising_parameters().await);
        println!(
            "{:?}",
            ble.cmd_set_le_advertising_data(
                create_advertising_data(&[
                    AdStructure::Flags(LE_GENERAL_DISCOVERABLE | BR_EDR_NOT_SUPPORTED),
                    AdStructure::ServiceUuids16(&[Uuid::Uuid16(0x1809)]),
                    AdStructure::CompleteLocalName(&name),
                ])
                .unwrap()
            )
            .await
        );
        println!("{:?}", ble.cmd_set_le_advertise_enable(true).await);

        println!("started advertising");

        let mut rf3 = |_offset: usize, data: &mut [u8]| {
            data[..5].copy_from_slice(&b"Hola!"[..]);
            5
        };
        let mut wf3 = |offset: usize, data: &[u8]| {
            println!("RECEIVED: Offset {}, data {:?}", offset, data);
            publisher.publish_immediate(SystemMessage::ButtonPressed);
        };

        gatt!([service {
            uuid: "937312e0-2354-11eb-9f10-fbc30a62cf38",
            characteristics: [characteristic {
                name: "my_characteristic",
                uuid: "987312e0-2354-11eb-9f10-fbc30a62cf38",
                notify: true,
                read: rf3,
                write: wf3,
            },],
        },]);

        let mut rng = bleps::no_rng::NoRng;
        let mut srv = AttributeServer::new(&mut ble, &mut gatt_attributes, &mut rng);

        let counter = RefCell::new(0u8);
        let counter = &counter;

        let mut notifier = || async {
            pin_ref.borrow_mut().wait_for_rising_edge().await;
            let mut data = [0u8; 13];
            data.copy_from_slice(b"Notification0");
            {
                let mut counter = counter.borrow_mut();
                data[data.len() - 1] += *counter;
                *counter = (*counter + 1) % 10;
            }
            NotificationData::new(my_characteristic_handle, &data)
        };

        srv.run(&mut notifier).await.unwrap();
    }
}
