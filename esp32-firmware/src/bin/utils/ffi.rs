extern crate core;

// #[link(name = "ctest", kind = "static")]
unsafe extern "C" {
    pub unsafe fn hello_number() -> core::ffi::c_int;
}

#[repr(C)]
#[derive(Copy, Clone)]
pub struct mp3dec_t {
    pub mdct_overlap: [[f32; 288usize]; 2usize],
    pub qmf_state: [f32; 960usize],
    pub reserv: core::ffi::c_int,
    pub free_format_bytes: core::ffi::c_int,
    pub header: [core::ffi::c_uchar; 4usize],
    pub reserv_buf: [core::ffi::c_uchar; 511usize],
}

pub const MINIMP3_MAX_SAMPLES_PER_FRAME: u32 = 2304;

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub struct mp3dec_frame_info_t {
    pub frame_bytes: core::ffi::c_int,
    pub frame_offset: core::ffi::c_int,
    pub channels: core::ffi::c_int,
    pub hz: core::ffi::c_int,
    pub layer: core::ffi::c_int,
    pub bitrate_kbps: core::ffi::c_int,
}

unsafe extern "C" {
    pub unsafe fn mp3dec_init(dec: *mut mp3dec_t);
}

pub type mp3d_sample_t = i16;

unsafe extern "C" {
    pub unsafe fn mp3dec_decode_frame(
        dec: *mut mp3dec_t,
        mp3: *const u8,
        mp3_bytes: core::ffi::c_int,
        pcm: *mut mp3d_sample_t,
        info: *mut mp3dec_frame_info_t,
    ) -> core::ffi::c_int;
}
