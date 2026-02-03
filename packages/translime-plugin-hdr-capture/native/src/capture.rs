//! HDR 屏幕捕获模块
//!
//! 使用 Windows Desktop Duplication API 捕获屏幕
//! 
//! 性能优化备忘录:
//! 1. 使用 CaptureSession 缓存 D3D 设备和 Duplication 接口，避免每次调用重复创建
//! 2. 优化循环等待逻辑，对于静止画面直接返回上一帧
//! 3. 智能质量判定代替固定 sleep
//! 4. 优化像素处理循环，避免重复内存分配

use napi_derive::napi;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_R16G16B16A16_FLOAT,
    DXGI_FORMAT_R10G10B10A2_UNORM, DXGI_SAMPLE_DESC, DXGI_FORMAT,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIOutput6,
    IDXGIOutputDuplication, IDXGIResource, DXGI_OUTDUPL_FRAME_INFO, DXGI_ERROR_WAIT_TIMEOUT,
    DXGI_ERROR_ACCESS_LOST,
};
use windows::core::Interface;
use std::sync::{Mutex, OnceLock};
use std::collections::HashMap;
use std::time::Duration;

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

/// 捕获会话结构体 - 保持 D3D 设备和 Duplication 状态
struct CaptureSession {
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    staging_resource: ID3D11Resource,
    width: u32,
    height: u32,
    pixel_format: DXGI_FORMAT,
    // 缓存上一帧的数据，用于超时快速返回
    last_buffer: Option<Vec<u8>>,
    last_raw_buffer: Option<Vec<u8>>,
}

// 确保 Session 可以在线程间传递 (Mutex 保护)
unsafe impl Send for CaptureSession {}
unsafe impl Sync for CaptureSession {}

// 全局会话缓存
static SESSIONS: OnceLock<Mutex<HashMap<u32, CaptureSession>>> = OnceLock::new();

fn get_sessions() -> &'static Mutex<HashMap<u32, CaptureSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 尝试创建一个新的捕获会话
fn create_session(display_id: u32) -> Result<CaptureSession, Box<dyn std::error::Error>> {
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

        // 获取描述
        let output_desc = output.GetDesc()?;
        
        // 创建 Duplication 接口
        let (duplication, is_output6) = {
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

        println!("[HDR-Native] Created Session for Display {} (scRGB: {})", display_id, is_output6);

        let dupl_desc = duplication.GetDesc();
        let pixel_format = dupl_desc.ModeDesc.Format;
        
        let mut width = dupl_desc.ModeDesc.Width;
        let mut height = dupl_desc.ModeDesc.Height;
        
        if width == 0 || height == 0 {
            width = (output_desc.DesktopCoordinates.right - output_desc.DesktopCoordinates.left).unsigned_abs();
            height = (output_desc.DesktopCoordinates.bottom - output_desc.DesktopCoordinates.top).unsigned_abs();
        }

        // 创建 Staging Texture
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: pixel_format,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };

        let mut staging_texture = None;
        device.CreateTexture2D(&staging_desc, None, Some(&mut staging_texture))?;
        let staging_texture = staging_texture.ok_or("Failed to create staging texture")?;
        let staging_resource: ID3D11Resource = staging_texture.cast()?;

        Ok(CaptureSession {
            context,
            duplication,
            staging_resource,
            width,
            height,
            pixel_format,
            last_buffer: None,
            last_raw_buffer: None,
        })
    }
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
pub fn capture_display(display_id: u32, hdr_options: Option<crate::HdrMappingOptions>) -> Result<crate::CaptureResult, Box<dyn std::error::Error>> {
    let mut sessions = get_sessions().lock().map_err(|_| "Failed to lock sessions")?;

    // 尝试获取或创建会话
    if !sessions.contains_key(&display_id) {
        let new_session = create_session(display_id)?;
        sessions.insert(display_id, new_session);
    }

    let session = sessions.get_mut(&display_id).ok_or("Session lost")?;
    
    unsafe {
        let width = session.width;
        let height = session.height;
        let pixel_format = session.pixel_format;
        
        let is_hdr_format = pixel_format == DXGI_FORMAT_R16G16B16A16_FLOAT || pixel_format == DXGI_FORMAT_R10G10B10A2_UNORM;
        let preserve_raw = hdr_options.as_ref()
             .and_then(|o| o.preserve_raw)
             .unwrap_or(false) && is_hdr_format;

        let has_cache = session.last_buffer.is_some();
        // 初次启动使用原来的长轮询 (30次)，有缓存时使用快速轮询 (5次) 避免阻塞
        let max_retries = if has_cache { 5 } else { 30 };
        let mut retry_count = 0;

        loop {
            let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut desktop_resource: Option<IDXGIResource> = None;
            
            // 恢复原本的"先快后慢"检测策略
            // 前15次尝试使用短超时 (10ms)，快速捕捉可能的帧
            // 后续尝试使用长超时 (100ms)，等待渲染完成
            let timeout_ms = if retry_count < 15 { 10 } else { 100 };

            match session.duplication.AcquireNextFrame(timeout_ms, &mut frame_info, &mut desktop_resource) {
                Ok(_) => {
                    if let Some(resource) = desktop_resource {
                        let desktop_texture: ID3D11Texture2D = resource.cast()?;
                        session.context.CopyResource(&session.staging_resource, &desktop_texture.cast::<ID3D11Resource>()?);
                        session.context.Flush();
                        
                        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                        session.context.Map(&session.staging_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
                        
                        let row_pitch = mapped.RowPitch as usize;
                        let mut temp_buffer = Vec::with_capacity((width * height * 4) as usize);
                        let mut temp_raw_buffer: Vec<u8> = if preserve_raw {
                            Vec::with_capacity((width * height * 8) as usize)
                        } else {
                            Vec::new()
                        };

                        // 像素处理与格式转换
                        for row in 0..height {
                            let src = (mapped.pData as *const u8).add(row as usize * row_pitch);
                            
                            if pixel_format == DXGI_FORMAT_R16G16B16A16_FLOAT {
                                let row_data = std::slice::from_raw_parts(src as *const u16, (width * 4) as usize);
                                if preserve_raw {
                                    let raw_bytes = std::slice::from_raw_parts(src, (width * 8) as usize);
                                    temp_raw_buffer.extend_from_slice(raw_bytes);
                                }
                                crate::image_proc::process_f16_row(row_data, &mut temp_buffer, hdr_options.as_ref());
                            } else if pixel_format == DXGI_FORMAT_R10G10B10A2_UNORM {
                                let row_data = std::slice::from_raw_parts(src as *const u32, width as usize);
                                if preserve_raw {
                                    let raw_bytes = std::slice::from_raw_parts(src, (width * 4) as usize);
                                    temp_raw_buffer.extend_from_slice(raw_bytes);
                                }
                                crate::image_proc::process_10bit_row(row_data, &mut temp_buffer, is_hdr_format, hdr_options.as_ref());
                            } else {
                                // RGBA/BGRA 8bit
                                let row_data = std::slice::from_raw_parts(src, (width * 4) as usize);
                                temp_buffer.reserve(row_data.len());
                                if pixel_format == DXGI_FORMAT_B8G8R8A8_UNORM || pixel_format == DXGI_FORMAT_B8G8R8A8_UNORM_SRGB {
                                    for pixel in row_data.chunks(4) {
                                        temp_buffer.push(pixel[2]); // R
                                        temp_buffer.push(pixel[1]); // G
                                        temp_buffer.push(pixel[0]); // B
                                        temp_buffer.push(255);
                                    }
                                } else {
                                    temp_buffer.extend_from_slice(row_data);
                                }
                            }
                        }
                        
                        let _ = session.duplication.ReleaseFrame();

                        // --- 质量判定 ---
                        let total_pixels = temp_buffer.len() / 4;
                        // 抽样检查：每20个像素取一个，判断是否有效
                        let valid_count = temp_buffer.chunks(4).step_by(20).filter(|p| p[0] > 10 || p[1] > 10 || p[2] > 10).count();
                        let current_ratio = valid_count as f32 / (total_pixels / 20 + 1) as f32;
                        
                        // 判定通过条件：
                        // 1. 质量良好 (ratio > 0.8)
                        // 2. 或者已经达到最大重试次数 (可能是真实的黑屏，接受它，不返回上一帧)
                        if current_ratio > 0.8 || retry_count >= max_retries {
                            session.last_buffer = Some(temp_buffer.clone());
                            if preserve_raw { session.last_raw_buffer = Some(temp_raw_buffer.clone()); } else { session.last_raw_buffer = None; }

                            return Ok(crate::CaptureResult {
                                buffer: temp_buffer.into(),
                                width,
                                height,
                                is_hdr: is_hdr_format,
                                raw_hdr_buffer: if preserve_raw { Some(temp_raw_buffer.into()) } else { None },
                            });
                        } else {
                            // 质量不佳，继续尝试
                            // 如果是"快"阶段，稍微 sleep 一下防止 CPU 空转太快；"慢"阶段 AcquireNextFrame 已经等了 100ms
                            if retry_count < 15 {
                                std::thread::sleep(Duration::from_millis(10));
                            }
                            retry_count += 1;
                            continue;
                        }
                    } else {
                        // Resource 为空
                        let _ = session.duplication.ReleaseFrame();
                        if retry_count >= max_retries {
                             // 次数用尽仍为空，尝试返回缓存，无缓存则报错
                             if let Some(buf) = &session.last_buffer {
                                 return Ok(crate::CaptureResult {
                                    buffer: buf.clone().into(),
                                    width,
                                    height,
                                    is_hdr: is_hdr_format,
                                    raw_hdr_buffer: session.last_raw_buffer.as_ref().map(|v| v.clone().into()),
                                });
                             } else {
                                 return Err("Captured empty frame".into());
                             }
                        }
                        retry_count += 1;
                        continue;
                    }
                }
                Err(e) if e.code() == DXGI_ERROR_WAIT_TIMEOUT => {
                    // 超时 (无变化) -> 直接返回缓存 (性能优化)
                    if let Some(buf) = &session.last_buffer {
                        return Ok(crate::CaptureResult {
                            buffer: buf.clone().into(),
                            width,
                            height,
                            is_hdr: is_hdr_format,
                            raw_hdr_buffer: session.last_raw_buffer.as_ref().map(|v| v.clone().into()),
                        });
                    }
                    // 初次启动且超时，重试
                    retry_count += 1;
                    continue;
                }
                Err(e) if e.code() == DXGI_ERROR_ACCESS_LOST => {
                    println!("[HDR-Native] Device access lost");
                    sessions.remove(&display_id);
                    return Err("Device access lost, please retry".into());
                }
                Err(e) => {
                    return Err(format!("Capture failed: {:?}", e).into());
                }
            }
        }
        
        #[allow(unreachable_code)]
        Err("Max retries exceeded".into())
    }
}
