use core::arch::asm;

pub const MAX_LED_COUNT: usize = 8;

pub struct WS2812 {}

impl WS2812 {
    pub fn new() -> Self {
        Self {}
    }

    pub fn reset(&mut self) {
        let portd = 0x40011410 as *mut u32;

        let pin_num = 4;
        let pin_reset_bit = 1 << 16 + pin_num;

        unsafe {
            portd.write_volatile(pin_reset_bit);
        } // Set low

        qingke::riscv::asm::delay(50 * 48);
    }

    pub fn set_all_leds(&mut self, count: u8, colour: u32) {
        self.set_leds(count, &[colour; MAX_LED_COUNT][0..count as usize]);
    }

    pub fn set_leds(&mut self, count: u8, buf: &[u32]) {
        // Implementation for setting LEDs
        // buf contains the hex color data as bytes

        for pixel in buf {
            self.set_color(*pixel);
        }

        qingke::riscv::asm::delay(1000000);
    }

    #[qingke_rt::highcode]
    pub fn set_color(&mut self, color: u32) {
        let portd = 0x40011410u32;
        let pin_set_bit = 1u32 << 4; // Set pin 4 high
        let pin_reset_bit = 1u32 << 16 + 4; // Set pin 4 low (16 + 4)

        unsafe {
            // Send 24 bits of WS2812 data
            for i in (0..24).rev() {
                if color & (1 << i) == 0 {
                    // Send a '0' bit: 0.4μs high, 0.85μs low
                    asm!(
                        // Set pin high
                        "sw {pin_set}, 0({port})",

                        // Delay ~0.4μs (19 cycles at 48MHz)
                        "li t0, 4",
                        "1:",
                        "addi t0, t0, -1",
                        "bnez t0, 1b",
                        "nop",
                        "nop",
                        "nop",

                        // Set pin low
                        "sw {pin_reset}, 0({port})",

                        // Delay ~0.85μs (41 cycles at 48MHz)
                        "li t0, 9",
                        "2:",
                        "addi t0, t0, -1",
                        "bnez t0, 2b",
                        "nop",
                        "nop",
                        "nop",
                        "nop",
                        "nop",

                        port = in(reg) portd,
                        pin_set = in(reg) pin_set_bit,
                        pin_reset = in(reg) pin_reset_bit,
                        out("t0") _,
                        options(nostack)
                    );
                } else {
                    // Send a '1' bit: 0.8μs high, 0.45μs low
                    asm!(
                        // Set pin high
                        "sw {pin_set}, 0({port})",

                        // Delay ~0.8μs (38 cycles at 48MHz)
                        "li t0, 8",
                        "1:",
                        "addi t0, t0, -1",
                        "bnez t0, 1b",
                        "nop",
                        "nop",
                        "nop",
                        "nop",
                        "nop",
                        "nop",

                        // Set pin low
                        "sw {pin_reset}, 0({port})",

                        // Delay ~0.45μs (22 cycles at 48MHz)
                        "li t0, 4",
                        "2:",
                        "addi t0, t0, -1",
                        "bnez t0, 2b",
                        "nop",
                        "nop",
                        "nop",
                        "nop",

                        port = in(reg) portd,
                        pin_set = in(reg) pin_set_bit,
                        pin_reset = in(reg) pin_reset_bit,
                        out("t0") _,
                        options(nostack)
                    );
                }
            }

            // Final low pulse and reset delay (>50μs)
            asm!(
                // Ensure pin is low
                "sw {pin_reset}, 0({port})",

                // Reset delay ~50μs (2400 cycles at 48MHz)
                "li t0, 600",
                "1:",
                "addi t0, t0, -1",
                "bnez t0, 1b",

                port = in(reg) portd,
                pin_reset = in(reg) pin_reset_bit,
                out("t0") _,
                options(nostack)
            );
        }
    }
}
