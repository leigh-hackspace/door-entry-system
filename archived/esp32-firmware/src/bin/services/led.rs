use esp_hal::{
    gpio::Level,
    peripherals::Peripherals,
    rmt::{Channel, PulseCode, Rmt, TxChannelAsync as _, TxChannelConfig, TxChannelCreatorAsync as _},
    time::Rate,
    Async,
};

const NUM_LEDS: usize = 8;

const SK68XX_CODE_PERIOD: u32 = 1250; // 800kHz
const SK68XX_T0H_NS: u32 = 400; // 300ns per SK6812 datasheet, 400 per WS2812. Some require >350ns for T0H. Others <500ns for T0H.
const SK68XX_T0L_NS: u32 = SK68XX_CODE_PERIOD - SK68XX_T0H_NS;
const SK68XX_T1H_NS: u32 = 850; // 900ns per SK6812 datasheet, 850 per WS2812. > 550ns is sometimes enough. Some require T1H >= 2 * T0H. Some require > 300ns T1L.
const SK68XX_T1L_NS: u32 = SK68XX_CODE_PERIOD - SK68XX_T1H_NS;

pub struct LedService {
    channel: Channel<Async, 0>,
    zero: u32,
    one: u32,
}

impl LedService {
    pub fn new() -> Self {
        let peripherals = unsafe { Peripherals::steal() };

        let freq = Rate::from_mhz(80);

        let rmt = Rmt::new(peripherals.RMT, freq).unwrap().into_async();

        let led_pin = peripherals.GPIO8;

        let config = TxChannelConfig::default()
            .with_clk_divider(1)
            .with_idle_output_level(Level::Low)
            .with_carrier_modulation(false)
            .with_idle_output(false);

        let channel = rmt.channel0.configure(led_pin, config).unwrap();

        let clocks = esp_hal::clock::Clocks::get();
        let src_clock = clocks.apb_clock.as_mhz();

        let zero = PulseCode::new(
            Level::High,
            ((SK68XX_T0H_NS * src_clock) / 1000) as u16,
            Level::Low,
            ((SK68XX_T0L_NS * src_clock) / 1000) as u16,
        );

        let one = PulseCode::new(
            Level::High,
            ((SK68XX_T1H_NS * src_clock) / 1000) as u16,
            Level::Low,
            ((SK68XX_T1L_NS * src_clock) / 1000) as u16,
        );

        Self { channel, zero, one }
    }

    pub async fn send(&mut self, r: u8, g: u8, b: u8) {
        let mut data = [0u32; 48];

        set_rgb_bits(&mut data, r, g, b, self.one, self.zero);

        for _ in 0..NUM_LEDS {
            self.channel.transmit(&data).await.expect("RMT Transmit Failure");
        }

        data.fill(0);

        self.channel.transmit(&data).await.expect("RMT Transmit Failure");
    }
}

fn set_rgb_bits(data: &mut [u32], r: u8, g: u8, b: u8, one: u32, zero: u32) {
    for i in 0..8 {
        data[i] = if (g >> (7 - i)) & 1 == 1 { one } else { zero };
        data[8 + i] = if (r >> (7 - i)) & 1 == 1 { one } else { zero };
        data[16 + i] = if (b >> (7 - i)) & 1 == 1 { one } else { zero };
    }
}
