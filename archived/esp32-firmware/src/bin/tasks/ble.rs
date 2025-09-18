use crate::{
    services::{common::DeviceConfig, state::PermanentStateService},
    tasks::button::ButtonSignalMessage,
};
use bleps::{
    ad_structure::{create_advertising_data, AdStructure, BR_EDR_NOT_SUPPORTED, LE_GENERAL_DISCOVERABLE},
    async_attribute_server::AttributeServer,
    asynch::Ble,
    attribute_server::NotificationData,
    gatt,
};
use core::cell::RefCell;
use esp_alloc as _;
use esp_backtrace as _;
use esp_hal::{
    gpio::{self},
    peripherals::Peripherals,
};
use esp_println::println;
use esp_wifi::ble::controller::BleConnector;
use log::info;

use super::button::ButtonSignal;

#[embassy_executor::task]
pub async fn ble_task(connector: BleConnector<'static>, config_service: PermanentStateService<DeviceConfig>, signal: &'static ButtonSignal) -> ! {
    info!("BLE Task Started");

    let peripherals = unsafe { Peripherals::steal() };

    let button = gpio::Input::new(peripherals.GPIO0, gpio::InputConfig::default().with_pull(gpio::Pull::Up));

    let now = || esp_hal::time::Instant::now().duration_since_epoch().as_millis();
    let mut ble = Ble::new(connector, now);

    let pin_ref = RefCell::new(button);
    let pin_ref = &pin_ref;

    let name = config_service.get_data().name.clone();

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
            signal.signal(ButtonSignalMessage::ButtonPressed);
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
