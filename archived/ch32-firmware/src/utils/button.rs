// Button handler module
#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum InterruptMessage {
    None,
    ShortPress,
    LongPress,
}

pub struct ButtonHandler {
    state: bool,
    last_state: bool,
    press_start: u32,
    stable_since: u32,
    long_press_triggered: bool,
    debounce_ms: u32,
    long_press_ms: u32,
}

impl ButtonHandler {
    pub const fn new(debounce_ms: u32, long_press_ms: u32) -> Self {
        Self {
            state: false,
            last_state: false,
            press_start: 0,
            stable_since: 0,
            long_press_triggered: false,
            debounce_ms,
            long_press_ms,
        }
    }

    pub fn update(&mut self, is_pressed: bool, current_millis: u32) -> InterruptMessage {
        // Check for state change
        if is_pressed != self.state {
            self.stable_since = current_millis;
            self.state = is_pressed;
        }

        // If state has been stable for debounce period
        if current_millis - self.stable_since >= self.debounce_ms {
            if self.state && !self.last_state {
                // Button just pressed
                self.press_start = current_millis;
                self.long_press_triggered = false;
            }

            let press_duration = current_millis - self.press_start;
            let mut message = InterruptMessage::None;

            if !self.state && self.last_state {
                // Button just released
                if press_duration < self.long_press_ms && !self.long_press_triggered {
                    message = InterruptMessage::ShortPress;
                }
                self.long_press_triggered = false;
            }

            if self.state && !self.long_press_triggered {
                // Button is pressed and long press hasn't been triggered yet
                if press_duration >= self.long_press_ms {
                    message = InterruptMessage::LongPress;
                    self.long_press_triggered = true;
                }
            }

            self.last_state = self.state;
            return message;
        }

        InterruptMessage::None
    }
}
