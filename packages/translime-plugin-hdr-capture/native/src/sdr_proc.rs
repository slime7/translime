use rayon::prelude::*;

/// 将 BGRA8 缓冲区转换为 RGBA8，并忽略输入 Alpha。
///
/// SDR 屏幕下我们直接保留桌面合成后的颜色，只做通道重排并强制不透明，
/// 避免预乘 Alpha 在保存时带来发灰边缘。
pub fn process_bgra8_buffer_parallel(src: &[u8], width: u32, height: u32) -> Vec<u8> {
    let width_usize = width as usize;
    let height_usize = height as usize;
    let mut dest = vec![0u8; width_usize * height_usize * 4];

    let src_stride = width_usize * 4;
    let dest_stride = width_usize * 4;

    dest.par_chunks_mut(dest_stride)
        .enumerate()
        .for_each(|(y, row_dest)| {
            let src_row_offset = y * src_stride;
            if src_row_offset + src_stride <= src.len() {
                let src_row = &src[src_row_offset..src_row_offset + src_stride];

                for x in 0..width_usize {
                    let s_off = x * 4;
                    let d_off = x * 4;

                    row_dest[d_off] = src_row[s_off + 2];
                    row_dest[d_off + 1] = src_row[s_off + 1];
                    row_dest[d_off + 2] = src_row[s_off];
                    row_dest[d_off + 3] = 255;
                }
            }
        });

    dest
}
