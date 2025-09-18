use embassy_rp::{
    Peri, bind_interrupts,
    peripherals::{DMA_CH6, PIN_9, PIO2},
    pio::{InterruptHandler, Pio},
    pio_programs::ws2812::{PioWs2812, PioWs2812Program},
};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::Timer;
use smart_leds::RGB8;

bind_interrupts!(struct Irqs {
    PIO2_IRQ_0 => InterruptHandler<PIO2>;
});

#[derive(PartialEq, Debug)]
pub enum Ws2812Message {
    Flash(u64, u32, u8, u8, u8),
}

pub type Ws2812Signal = Signal<CriticalSectionRawMutex, Ws2812Message>;

const NUM_LEDS: usize = 8;

#[embassy_executor::task]
pub async fn ws2812_task(signal: &'static Ws2812Signal, pio: Peri<'static, PIO2>, dma: Peri<'static, DMA_CH6>, din: Peri<'static, PIN_9>) {
    let Pio { mut common, sm0, .. } = Pio::new(pio, Irqs);

    let program = PioWs2812Program::new(&mut common);
    let mut ws2812 = PioWs2812::new(&mut common, sm0, dma, din, &program);

    let mut data = [RGB8::default(); NUM_LEDS];

    loop {
        match signal.wait().await {
            Ws2812Message::Flash(ms, times, red, green, blue) => {
                for _ in 0..times {
                    for i in 0..NUM_LEDS {
                        data[i] = RGB8::new(red, green, blue)
                    }

                    ws2812.write(&data).await;

                    Timer::after_millis(ms as u64).await;

                    for i in 0..NUM_LEDS {
                        data[i] = RGB8::new(0, 0, 0)
                    }

                    ws2812.write(&data).await;

                    Timer::after_millis(ms as u64).await;
                }
            }
        }
    }
}
