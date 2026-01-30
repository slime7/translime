//! HDR 屏幕捕获模块
//!
//! 使用 Windows Desktop Duplication API 捕获屏幕

use napi_derive::napi;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_R16G16B16A16_FLOAT,
    DXGI_FORMAT_R10G10B10A2_UNORM, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIOutput6,
    IDXGIResource, DXGI_OUTDUPL_FRAME_INFO,
};
use windows::core::Interface;

/// 显示器信息
#[napi(object)]
pub struct DisplayInfo {
    /// 显示器索引
    pub id: u32,
    /// 显示器名称
    pub name: String,
    /// 左边界
    pub x: i32,
    /// 上边界
    pub y: i32,
    /// 宽度
    pub width: u32,
    /// 高度
    pub height: u32,
    /// 是否主显示器
    pub is_primary: bool,
}

/// 获取所有显示器信息
pub fn get_displays() -> Vec<DisplayInfo> {
    let mut displays = Vec::new();

    unsafe {
        let factory: IDXGIFactory1 = match CreateDXGIFactory1() {
            Ok(f) => f,
            Err(_) => return displays,
        };

        let mut adapter_idx = 0u32;
        while let Ok(adapter) = factory.EnumAdapters(adapter_idx) {
            let mut output_idx = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_idx) {
                if let Ok(desc) = output.GetDesc() {
                    let name_len = desc.DeviceName.iter().position(|&c| c == 0).unwrap_or(desc.DeviceName.len());
                    let name = String::from_utf16_lossy(&desc.DeviceName[..name_len]);

                    let x = desc.DesktopCoordinates.left;
                    let y = desc.DesktopCoordinates.top;
                    let width = (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left) as u32;
                    let height = (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top) as u32;

                    displays.push(DisplayInfo {
                        id: displays.len() as u32,
                        name,
                        x,
                        y,
                        width,
                        height,
                        is_primary: adapter_idx == 0 && output_idx == 0,
                    });
                }
                output_idx += 1;
            }
            adapter_idx += 1;
        }
    }

    displays
}

/// 捕获指定显示器的屏幕
#[allow(clippy::collapsible_if)]
pub fn capture_display(display_id: u32, hdr_options: Option<crate::HdrMappingOptions>) -> Result<crate::CaptureResult, Box<dyn std::error::Error>> {
    unsafe {
        // 创建 DXGI Factory
        let factory: IDXGIFactory1 = CreateDXGIFactory1()?;

        // 查找目标显示器
        let mut current_id = 0u32;
        let mut target_output: Option<IDXGIOutput> = None;
        let mut target_adapter: Option<IDXGIAdapter> = None;

        let mut adapter_idx = 0u32;
        'outer: while let Ok(adapter) = factory.EnumAdapters(adapter_idx) {
            let mut output_idx = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_idx) {
                if current_id == display_id {
                    target_output = Some(output);
                    target_adapter = Some(adapter);
                    break 'outer;
                }
                current_id += 1;
                output_idx += 1;
            }
            adapter_idx += 1;
        }

        let output = target_output.ok_or("Display not found")?;
        let adapter = target_adapter.ok_or("Adapter not found")?;

        // 创建 D3D11 设备
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;

        D3D11CreateDevice(
            &adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            None,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;

        let device = device.ok_or("Failed to create D3D11 device")?;
        let context = context.ok_or("Failed to get device context")?;

        // 获取描述（由于后续 cast 可能移动，先执行）
        let output_desc = output.GetDesc()?;
        
        let (duplication, is_output6) = {
            // 尝试 IDXGIOutput6
            if let Ok(output6) = output.clone().cast::<IDXGIOutput6>() {
                let formats = [
                    DXGI_FORMAT_R16G16B16A16_FLOAT,
                    DXGI_FORMAT_B8G8R8A8_UNORM,
                    DXGI_FORMAT_R10G10B10A2_UNORM,
                ];
                match output6.DuplicateOutput1(&device, 0, &formats) {
                    Ok(dupl) => (dupl, true),
                    Err(_) => {
                        let output1: IDXGIOutput1 = output.clone().cast()?;
                        (output1.DuplicateOutput(&device)?, false)
                    }
                }
            } else {
                let output1: IDXGIOutput1 = output.clone().cast()?;
                (output1.DuplicateOutput(&device)?, false)
            }
        };

        println!("[HDR-Native] Display {} using Output6 (scRGB supported): {}", display_id, is_output6);
        let mut duplication = duplication;

        let dupl_desc = duplication.GetDesc();
        let pixel_format = dupl_desc.ModeDesc.Format;
        
        // 优先使用 duplication desc 的物理尺寸，如果为 0 则通过 DesktopCoordinates 兜底
        let mut width = dupl_desc.ModeDesc.Width;
        let mut height = dupl_desc.ModeDesc.Height;
        
        if width == 0 || height == 0 {
            width = (output_desc.DesktopCoordinates.right - output_desc.DesktopCoordinates.left).unsigned_abs();
            height = (output_desc.DesktopCoordinates.bottom - output_desc.DesktopCoordinates.top).unsigned_abs();
        }

        println!("[HDR-Native] Display {} Format: {:?}, Buffer Size: {}x{}", display_id, pixel_format, width, height);

        // 判断是否为 HDR 格式
        let is_hdr_format = pixel_format == DXGI_FORMAT_R16G16B16A16_FLOAT || pixel_format == DXGI_FORMAT_R10G10B10A2_UNORM;
        println!("[HDR-Native] Display {} is HDR: {}", display_id, is_hdr_format);

        // 创建 staging texture
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: pixel_format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };

        let mut staging_texture = None;
        device.CreateTexture2D(&staging_desc, None, Some(&mut staging_texture))?;
        let staging_texture = staging_texture.ok_or("Failed to create staging texture")?;
        let staging_resource: ID3D11Resource = staging_texture.cast()?;

        // 捕获循环：尝试获取一个非空帧
        let mut final_buffer = Vec::new();
        let mut raw_hdr_data: Option<Vec<u8>> = None;
        let mut retry_count = 0;
        
        // 判断是否需要保留原始 HDR 数据
        let preserve_raw = hdr_options.as_ref()
            .and_then(|o| o.preserve_raw)
            .unwrap_or(false) && is_hdr_format;
        
        while retry_count < 30 {
            let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut desktop_resource: Option<IDXGIResource> = None;
            
            // 阶梯式轮询：前 15 次快速 (10ms)，后 10 次深度 (100ms)
            let timeout = if retry_count < 15 { 10 } else { 100 };
            
            match duplication.AcquireNextFrame(timeout, &mut frame_info, &mut desktop_resource) {
                Ok(_) => {
                    if let Some(resource) = desktop_resource {
                        let desktop_texture: ID3D11Texture2D = resource.cast()?;
                        context.CopyResource(&staging_resource, &desktop_texture.cast::<ID3D11Resource>()?);
                        
                        // 强制刷新指令流，确保数据从 GPU 写入 Staging Texture
                        context.Flush();
                        
                        // 映射并读取
                        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                        context.Map(&staging_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
                        
                        let row_pitch = mapped.RowPitch as usize;
                        let mut temp_buffer = Vec::with_capacity((width * height * 4) as usize);
                        let mut temp_raw_buffer: Vec<u8> = if preserve_raw {
                            Vec::with_capacity((width * height * 8) as usize) // F16 需要 8 bytes per pixel
                        } else {
                            Vec::new()
                        };

                        for row in 0..height {
                            let src = (mapped.pData as *const u8).add(row as usize * row_pitch);
                            
                            if pixel_format == DXGI_FORMAT_R16G16B16A16_FLOAT {
                                let row_data = std::slice::from_raw_parts(src as *const u16, (width * 4) as usize);
                                
                                // 如果需要保留原始数据，复制原始字节
                                if preserve_raw {
                                    let raw_bytes = std::slice::from_raw_parts(src, (width * 8) as usize);
                                    temp_raw_buffer.extend_from_slice(raw_bytes);
                                }
                                
                                crate::image_proc::process_f16_row(row_data, &mut temp_buffer, hdr_options.as_ref());
                            } else if pixel_format == DXGI_FORMAT_R10G10B10A2_UNORM {
                                let row_data = std::slice::from_raw_parts(src as *const u32, width as usize);
                                
                                // 如果需要保留原始数据，复制原始字节
                                if preserve_raw {
                                    let raw_bytes = std::slice::from_raw_parts(src, (width * 4) as usize);
                                    temp_raw_buffer.extend_from_slice(raw_bytes);
                                }
                                
                                crate::image_proc::process_10bit_row(row_data, &mut temp_buffer, is_hdr_format, hdr_options.as_ref());
                            } else if pixel_format == DXGI_FORMAT_B8G8R8A8_UNORM || pixel_format == DXGI_FORMAT_B8G8R8A8_UNORM_SRGB {
                                let row_data = std::slice::from_raw_parts(src, (width * 4) as usize);
                                for pixel in row_data.chunks(4) {
                                    temp_buffer.push(pixel[2]); // R
                                    temp_buffer.push(pixel[1]); // G
                                    temp_buffer.push(pixel[0]); // B
                                    temp_buffer.push(255);
                                }
                            } else {
                                // 默认 RGBA8 (如 R8G8B8A8)
                                let row_data = std::slice::from_raw_parts(src, (width * 4) as usize);
                                for pixel in row_data.chunks(4) {
                                    temp_buffer.push(pixel[0]);
                                    temp_buffer.push(pixel[1]);
                                    temp_buffer.push(pixel[2]);
                                    temp_buffer.push(255);
                                }
                            }
                        }
                        

                        context.Unmap(&staging_resource, 0);
                        let _ = duplication.ReleaseFrame();

                        // 增强判定：全屏均匀采样 100 个点，防止因为局部黑边导致误判
                        let total_pixels = temp_buffer.len() / 4;
                        let sample_step = (total_pixels / 100).max(1);
                        let has_content = (0..100).any(|i| {
                            let idx = i * sample_step * 4;
                            if idx + 2 < temp_buffer.len() {
                                temp_buffer[idx] > 0 || temp_buffer[idx+1] > 0 || temp_buffer[idx+2] > 0
                            } else {
                                false
                            }
                        });
                        
                        if has_content || retry_count >= 25 {
                            if retry_count > 0 {
                                println!("[HDR-Native] Display {} recovered at retry {}", display_id, retry_count);
                            }
                            final_buffer = temp_buffer;
                            if !temp_raw_buffer.is_empty() {
                                raw_hdr_data = Some(temp_raw_buffer);
                            }
                            break;
                        } else {
                            // 如果重试次数过多依然全黑，尝试重置下 duplication
                            // 此时不进行复杂的重新 API 获取，仅执行 ReleaseFrame 并等待
                            // 下一次循环会自动进行 AcquireNextFrame
                        }
                    } else {
                        let _ = duplication.ReleaseFrame();
                    }
                }
                Err(e) => {
                    let err_code = e.code();
                    // 仅在关键错误（访问丢失）时重新初始化
                    if err_code == windows::Win32::Graphics::Dxgi::DXGI_ERROR_ACCESS_LOST 
                        && let Ok(new_dupl) = output.clone().cast::<IDXGIOutput1>().and_then(|o| o.DuplicateOutput(&device)) {
                             duplication = new_dupl;
                    }
                }
            }
            retry_count += 1;
        }



        if final_buffer.is_empty() {
            return Err("Failed to capture a valid frame (all black or timeout)".into());
        }

        Ok(crate::CaptureResult {
            buffer: final_buffer.into(),
            width,
            height,
            is_hdr: is_hdr_format,
            raw_hdr_buffer: raw_hdr_data.map(|v| v.into()),
        })
    }
}


