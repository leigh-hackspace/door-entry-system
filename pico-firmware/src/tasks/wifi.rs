use crate::make_static;
use core::net::Ipv6Addr;
use cyw43::JoinOptions;
use cyw43_pio::{DEFAULT_CLOCK_DIVIDER, PioSpi};
use defmt::*;
use embassy_executor::Spawner;
use embassy_futures::yield_now;
use embassy_net::{Stack, StackResources};
use embassy_rp::bind_interrupts;
use embassy_rp::pio::InterruptHandler;
use embassy_rp::{
    Peri,
    clocks::RoscRng,
    gpio::{Level, Output},
    peripherals::{DMA_CH6, PIN_23, PIN_24, PIN_25, PIN_29, PIO1},
    pio::Pio,
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use static_cell::StaticCell;

bind_interrupts!(struct Irqs {
    PIO1_IRQ_0 => InterruptHandler<PIO1>;
});

const WIFI_NETWORK: &str = env!("WIFI_NETWORK");
const WIFI_PASSWORD: &str = env!("WIFI_PASSWORD");

#[derive(Debug)]
pub enum EthernetSignalMessage {
    Connected,
}

pub type EthernetSignal = Signal<CriticalSectionRawMutex, EthernetSignalMessage>;

pub async fn init_wifi(
    spawner: Spawner,
    pio: Peri<'static, PIO1>,
    dio: Peri<'static, PIN_24>,
    clk: Peri<'static, PIN_29>,
    cs: Peri<'static, PIN_25>,
    pwr: Peri<'static, PIN_23>,
    dma: Peri<'static, DMA_CH6>,
) -> (&'static EthernetSignal, Stack<'static>) {
    let ethernet_signal = make_static!(EthernetSignal, Signal::new());

    let mut rng = RoscRng;

    let fw = include_bytes!("../../embassy/cyw43-firmware/43439A0.bin");
    let clm = include_bytes!("../../embassy/cyw43-firmware/43439A0_clm.bin");

    let pwr = Output::new(pwr, Level::Low);
    let cs = Output::new(cs, Level::High);
    let mut pio = Pio::new(pio, Irqs);
    let spi = PioSpi::new(&mut pio.common, pio.sm0, DEFAULT_CLOCK_DIVIDER, pio.irq0, cs, dio, clk, dma);

    info!("SPI configured");

    static STATE: StaticCell<cyw43::State> = StaticCell::new();
    let state = STATE.init(cyw43::State::new());
    let (net_device, mut control, runner) = cyw43::new(state, pwr, spi, fw).await;

    spawner.spawn((cyw43_task(runner).unwrap()));
    info!("WiFi task started");

    control.init(clm).await;
    control.set_power_management(cyw43::PowerManagementMode::None).await;

    // Generate random seed
    let seed = rng.next_u64();

    let config = embassy_net::Config::dhcpv4(Default::default());

    // Init network stack
    static RESOURCES: StaticCell<StackResources<5>> = StaticCell::new();
    let (stack, runner) = embassy_net::new(net_device, config, RESOURCES.init(StackResources::new()), seed);

    // Launch network task
    spawner.spawn(net_task(runner).unwrap());
    info!("Network task started");

    spawner.spawn(ethernet_dhcp_task(ethernet_signal, stack).unwrap());
    info!("DHCP task started");

    (ethernet_signal, stack)
}

#[embassy_executor::task]
async fn cyw43_task(runner: cyw43::Runner<'static, Output<'static>, PioSpi<'static, PIO1, 0, DMA_CH6>>) -> ! {
    runner.run().await
}

#[embassy_executor::task]
async fn net_task(mut runner: embassy_net::Runner<'static, cyw43::NetDriver<'static>>) -> ! {
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
