use core::net::Ipv6Addr;

use crate::make_static;
use crate::tasks::common::{EthernetSignal, EthernetSignalMessage};
use defmt::*;
use embassy_executor::Spawner;
use embassy_futures::yield_now;
use embassy_net::{DhcpConfig, Ipv6Cidr, Stack, StackResources, StaticConfigV6};
use embassy_net_wiznet::{Device, Runner, State, chip::W6100};
use embassy_rp::{
    Peri,
    clocks::RoscRng,
    gpio::{Input, Level, Output, Pull},
    pac::Interrupt::SPI0_IRQ,
    peripherals::{DMA_CH0, DMA_CH1, PIN_16, PIN_17, PIN_18, PIN_19, PIN_20, PIN_21, SPI0},
    spi::{Async, Config, Spi},
};
use embassy_sync::{
    blocking_mutex::raw::CriticalSectionRawMutex,
    signal::{self, Signal},
};
use embassy_time::{Delay, Timer};
use embedded_hal_async::delay;
use embedded_hal_bus::spi::ExclusiveDevice;
use static_cell::StaticCell;

pub async fn init_ethernet(
    spawner: Spawner,
    spi: Peri<'static, SPI0>,
    miso: Peri<'static, PIN_16>,
    mosi: Peri<'static, PIN_19>,
    clk: Peri<'static, PIN_18>,
    cs: Peri<'static, PIN_17>,
    int: Peri<'static, PIN_21>,
    reset: Peri<'static, PIN_20>,
    dma0: Peri<'static, DMA_CH0>,
    dma1: Peri<'static, DMA_CH1>,
) -> (&'static EthernetSignal, Stack<'static>) {
    let ethernet_signal = make_static!(EthernetSignal, Signal::new());

    let mut rng = RoscRng;

    let mut spi_cfg = embassy_rp::spi::Config::default();
    spi_cfg.frequency = 50_000_000;
    let spi = Spi::new(spi, clk, mosi, miso, dma0, dma1, spi_cfg);
    let cs = Output::new(cs, Level::High);
    let w6100_int = Input::new(int, Pull::Up);
    let w6100_reset = Output::new(reset, Level::High);

    info!("SPI configured");

    let mac_addr = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55];
    static STATE: StaticCell<State<8, 8>> = StaticCell::new();
    let state = STATE.init(State::<8, 8>::new());
    let (device, runner) = embassy_net_wiznet::new(mac_addr, state, ExclusiveDevice::new(spi, cs, Delay).unwrap(), w6100_int, w6100_reset)
        .await
        .unwrap();

    spawner.spawn(ethernet_task(runner).unwrap());
    info!("Ethernet task started");

    // Generate random seed
    let seed = rng.next_u64();

    let mut dhcp_config: DhcpConfig = Default::default();
    dhcp_config.retry_config.initial_request_timeout = smoltcp::time::Duration::from_millis(100);

    // Init network stack
    static RESOURCES: StaticCell<StackResources<8>> = StaticCell::new();
    let (stack, runner) = embassy_net::new(device, embassy_net::Config::dhcpv4(dhcp_config), RESOURCES.init(StackResources::new()), seed);

    // Launch network task
    spawner.spawn(net_task(runner).unwrap());
    info!("Network task started");

    spawner.spawn(ethernet_dhcp_task(ethernet_signal, stack).unwrap());
    info!("DHCP task started");

    (ethernet_signal, stack)
}

#[embassy_executor::task]
async fn ethernet_task(
    runner: Runner<'static, W6100, ExclusiveDevice<Spi<'static, SPI0, Async>, Output<'static>, Delay>, Input<'static>, Output<'static>>,
) -> ! {
    runner.run().await
}

#[embassy_executor::task]
async fn net_task(mut runner: embassy_net::Runner<'static, Device<'static>>) -> ! {
    runner.run().await
}

#[embassy_executor::task]
pub async fn ethernet_dhcp_task(signal: &'static EthernetSignal, stack: Stack<'static>) {
    info!("Waiting for DHCP...");
    let cfg = wait_for_config(stack).await;
    let local_addr = cfg.address.address();
    info!("IP address: {:?}", local_addr);

    // Timer::after_secs(5).await;

    signal.signal(EthernetSignalMessage::Connected);
}

async fn wait_for_config(stack: Stack<'static>) -> embassy_net::StaticConfigV4 {
    loop {
        if let Some(config) = stack.config_v4() {
            return config.clone();
        }
        yield_now().await;
    }
}
