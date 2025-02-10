use super::{common::DeviceState, state::PermanentStateService};
use crate::{make_static, tasks::audio::AudioSignal, utils::DoorPins};
use alloc::string::{String, ToString as _};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, signal::Signal};
use embassy_time::{Duration, Timer};
use esp_hal::gpio::{self, OutputConfig};
use log::{info, warn};

pub struct DoorService<'a> {
    state: PermanentStateService<DeviceState>,
    audio_signal: &'static Signal<CriticalSectionRawMutex, AudioSignal>,
    door: gpio::Output<'a>,
    pub changed_signal: &'static Signal<CriticalSectionRawMutex, ()>,
}

impl<'a> DoorService<'a> {
    pub fn new(
        state: PermanentStateService<DeviceState>,
        audio_signal: &'static Signal<CriticalSectionRawMutex, AudioSignal>,
    ) -> DoorService<'a> {
        let door = gpio::Output::new(DoorPins::new().door, gpio::Level::High, OutputConfig::default());
        let changed_signal = make_static!(Signal::<CriticalSectionRawMutex, ()>, Signal::new());

        let mut door_service = DoorService {
            state,
            audio_signal,
            door,
            changed_signal,
        };

        door_service.init();

        door_service
    }

    fn init(&mut self) {
        if self.state.get_data().latch {
            self.set_latch(true);
        }
    }

    pub fn get_latch(&mut self) -> bool {
        self.state.get_data().latch
    }

    pub fn set_latch(&mut self, latch: bool) {
        self.state.get_data().latch = latch;

        self.update_gpio(!latch);

        self.try_save();

        self.audio_signal.signal(AudioSignal::Play(self.get_latch_sound_file_name(latch)));
    }

    pub fn toggle_latch(&mut self) {
        let mut latch = self.state.get_data().latch;
        latch = !latch;
        self.state.get_data().latch = latch;

        self.update_gpio(!latch);

        self.try_save();

        self.audio_signal.signal(AudioSignal::Play(self.get_latch_sound_file_name(latch)));
    }

    pub async fn open_door(&mut self, open_sound: String) {
        if self.state.get_data().latch {
            return;
        }

        self.update_gpio(false);
        self.audio_signal.signal(AudioSignal::Play(open_sound));

        Timer::after(Duration::from_millis(5000)).await;

        self.audio_signal.signal(AudioSignal::Play("close.mp3".to_string()));
        self.update_gpio(true);
    }

    fn update_gpio(&mut self, locked: bool) {
        if locked {
            info!("==== HIGH ====");
            self.door.set_high();
        } else {
            info!("==== LOW ====");
            self.door.set_low();
        }
    }

    fn try_save(&mut self) {
        if let Err(err) = self.state.save() {
            warn!("Error saving state: {:?}", err);
        }

        self.changed_signal.signal(());
    }

    fn get_latch_sound_file_name(&mut self, latch: bool) -> String {
        if latch {
            "latchon.mp3".to_string()
        } else {
            "latchoff.mp3".to_string()
        }
    }
}
