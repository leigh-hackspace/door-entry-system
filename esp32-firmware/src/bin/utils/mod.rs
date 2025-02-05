use alloc::string::{String, ToString};
pub mod decoder;
pub mod ffi;
pub mod flash_stream;
pub mod local_fs;

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

pub fn get_latch_sound_file_name(latch: bool) -> String {
    if latch {
        "latchon.mp3".to_string()
    } else {
        "latchoff.mp3".to_string()
    }
}
