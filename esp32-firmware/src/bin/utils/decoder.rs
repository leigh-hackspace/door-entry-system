use super::ffi::{mp3dec_decode_frame, mp3dec_frame_info_t, mp3dec_init, mp3dec_t};
use core::{
    ffi::c_int,
    marker::PhantomData,
    mem::MaybeUninit,
    ptr::{self},
};

pub struct RawDecoder(MaybeUninit<mp3dec_t>);

/// Conditional type used to represent one PCM sample in output data.
///
/// Normally a signed 16-bit integer (`i16`), but if the *"float"* feature is enabled,
/// it's a 32-bit single-precision float (`f32`).
pub type Sample = i16;

// type &'src [u8] = &'src [u8];

// The minimp3 API takes `int` for size, however that won't work if
// your file exceeds 2GB (usually 2^31-1 bytes) in size. Thankfully,
// under pretty much no circumstances will each frame be >2GB.
// Even if it would be, this makes it not UB and just return err/eof.
#[inline(always)]
fn data_len_safe(len: usize) -> c_int {
    len.min(c_int::max_value() as usize) as c_int
}

/// Returns the source slice from a received `mp3dec_frame_info_t`.
#[inline(always)]
unsafe fn source_slice<'src, 'frame>(data: &'src [u8], frame_recv: &'frame mp3dec_frame_info_t) -> &'src [u8] {
    data.get_unchecked(frame_recv.frame_offset as usize..frame_recv.frame_bytes as usize)
}

// Note: This is redefined because rustdoc is annoying, and will output:
// `pub const ... = ffi::MINIMP3_MAX_SAMPLES_PER_FRAME as usize // 2304`
//
// There's a cargo test in case this is adjusted in the in the future.
/// Maximum amount of samples that can be yielded per frame.
pub const MAX_SAMPLES_PER_FRAME: usize = 0x900;

/// Describes audio samples in a frame.
pub struct Audio<'src, 'pcm> {
    // entire result from minimp3 as-is
    info: mp3dec_frame_info_t,

    // pcm data, if any
    pcm: Option<ptr::NonNull<Sample>>, // of lifetime 'pcm
    sample_count: usize,

    // source slice (without garbage)
    source: &'src [u8],

    // 👻
    phantom: PhantomData<&'pcm [Sample]>,
}

// Safety: The lifetimes do it for us.
unsafe impl<'src, 'pcm> Send for Audio<'src, 'pcm> {}
unsafe impl<'src, 'pcm> Sync for Audio<'src, 'pcm> {}

/// Describes a frame, which contains audio samples or other data.
pub enum Frame<'src, 'pcm> {
    /// PCM Audio
    Audio(Audio<'src, 'pcm>),

    /// ID3 or other unknown data
    Other(&'src [u8]),
}

impl RawDecoder {
    /// Constructs a new `RawDecoder` for processing MPEG Audio.
    pub fn new() -> Self {
        let mut decoder = MaybeUninit::uninit();
        unsafe {
            mp3dec_init(decoder.as_mut_ptr());
        }
        Self(decoder)
    }

    /// Reads the next frame, skipping over potential garbage data.
    ///
    /// If the frame contains audio data, [`samples`](Audio::samples) should be used
    /// to get the slice, as not all of the `dest` slice may be filled up.
    #[inline]
    pub fn next<'src, 'pcm>(
        &mut self,
        src: &'src [u8],
        dest: &'pcm mut [Sample; MAX_SAMPLES_PER_FRAME],
    ) -> Option<(Frame<'src, 'pcm>, usize)> {
        self.call(src, Some(dest))
    }

    /// Reads the next frame without decoding it.
    ///
    /// This means that the samples will always be empty in [`Audio`],
    /// and [`sample_count`](Audio::sample_count) should be used to inspect the length.
    #[inline]
    pub fn peek<'src>(&mut self, src: &'src [u8]) -> Option<(Frame<'src, 'static>, usize)> {
        self.call(src, None)
    }

    fn call<'src, 'pcm>(
        &mut self,
        src: &'src [u8],
        dest: Option<&'pcm mut [Sample; MAX_SAMPLES_PER_FRAME]>,
    ) -> Option<(Frame<'src, 'pcm>, usize)> {
        let src_length = data_len_safe(src.len());
        let dest_ptr: *mut Sample = dest.map_or(ptr::null_mut(), |x| x).cast();
        unsafe {
            let uninit = MaybeUninit::uninit();
            let mut info = uninit.assume_init();
            let result = mp3dec_decode_frame(self.0.as_mut_ptr(), src.as_ptr(), src_length, dest_ptr, &mut info);
            let skip = info.frame_bytes as usize;

            if result != 0 {
                Some((
                    Frame::Audio(Audio {
                        info,
                        pcm: ptr::NonNull::new(dest_ptr),
                        sample_count: result as usize,
                        source: source_slice(src, &info),
                        phantom: PhantomData,
                    }),
                    skip,
                ))
            } else if info.frame_bytes != 0 {
                Some((Frame::Other(source_slice(src, &info)), skip))
            } else {
                None
            }
        }
    }
}

impl<'src, 'pcm> Audio<'src, 'pcm> {
    /// Gets the bitrate of this frame in kb/s.
    #[inline]
    pub fn bitrate(&self) -> u32 {
        self.info.bitrate_kbps as u32
    }

    /// Gets the channel count of this frame.
    #[inline]
    pub fn channels(&self) -> u16 {
        // CAST: This is always 1 or 2 (but conventionally channels are u16).
        // info->channels = HDR_IS_MONO(hdr) ? 1 : 2;
        self.info.channels as u16
    }

    /// Gets the MPEG layer of this frame.
    #[inline]
    pub fn mpeg_layer(&self) -> u8 {
        // CAST: This is always at most 4.
        // info->layer = 4 - HDR_GET_LAYER(hdr);
        self.info.layer as u8
    }

    /// Gets the sample rate of this frame in Hz.
    #[inline]
    pub fn sample_rate(&self) -> u32 {
        self.info.hz as u32
    }

    /// Gets the slice of samples in this frame.
    /// Samples are interleaved, so the length is
    /// [`channels`](Self::channels) \* [`sample_count`](Self::sample_count).
    ///
    /// Do not use this to inspect the number of samples, as
    /// if this frame was `peek`ed, an empty slice will be given.
    #[inline]
    pub fn samples(&self) -> &'pcm [Sample] {
        match self.pcm {
            Some(ptr) => unsafe {
                (&*ptr.cast::<[Sample; MAX_SAMPLES_PER_FRAME]>().as_ptr()).get_unchecked(..self.sample_count * self.info.channels as usize)
            },
            None => &[],
        }
    }

    /// Gets the sample count per [`channel`](Self::channels).
    #[inline]
    pub fn sample_count(&self) -> usize {
        self.sample_count
    }

    /// Gets the source slice with potential garbage stripped.
    #[inline]
    pub fn source(&self) -> &'src [u8] {
        self.source
    }
}
