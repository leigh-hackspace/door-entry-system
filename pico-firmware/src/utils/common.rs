use crate::utils::local_fs::LocalFs;
use alloc::sync::Arc;
use embassy_rp::{flash::ERASE_SIZE, peripherals::FLASH};
use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, rwlock::RwLock};

const ADDR_OFFSET: u32 = 0x300000;
const PART_BLOCKS: usize = 256;
const PART_SIZE: usize = PART_BLOCKS * ERASE_SIZE;
const FLASH_SIZE: usize = 4 * 1024 * 1024;

pub type Flash = embassy_rp::flash::Flash<'static, FLASH, embassy_rp::flash::Async, FLASH_SIZE>;

pub type SharedFs = Arc<RwLock<CriticalSectionRawMutex, LocalFs>>;

/// Replacement for [`static_cell::make_static`](https://docs.rs/static_cell/latest/static_cell/macro.make_static.html) for use cases when the type is known.
#[macro_export]
macro_rules! make_static {
    ($t:ty, $val:expr) => ($crate::make_static!($t, $val,));
    ($t:ty, $val:expr, $(#[$m:meta])*) => {{
        $(#[$m])*
        static STATIC_CELL: static_cell::StaticCell<$t> = static_cell::StaticCell::new();
        STATIC_CELL.init($val)
    }};
}
