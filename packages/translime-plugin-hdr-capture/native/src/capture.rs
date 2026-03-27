//! HDR 屏幕捕获模块 (Windows Graphics Capture 版)
//!
//! 该模块利用 Windows Graphics Capture API 实现了高性能的 HDR 屏幕捕获。
//! 为了避免频繁创建 D3D 设备带来的性能开销及可能的会话失效错误，
//! 模块对 D3D11 设备、上下文及 Staging Texture 进行了持久化缓存。

use napi_derive::napi;
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
    D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::{
    Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_SAMPLE_DESC},
    CreateDXGIFactory1, DXGI_OUTPUT_DESC, IDXGIDevice, IDXGIFactory1,
};
use windows::Win32::Graphics::Gdi::HMONITOR;
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::core::{IInspectable, Interface};

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex, OnceLock};

/// 显示器描述信息
#[napi(object)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// 内部使用的缓存帧结构
#[derive(Clone)]
struct CachedFrame {
    buffer: Vec<u8>,
    raw_buffer: Option<Vec<u8>>,
    width: u32,
    height: u32,
    is_hdr: bool,
}

/// 帧请求的同步状态
struct RequestState {
    pending: bool,
    result: Option<Result<crate::CaptureResult, String>>,
}

/// 帧请求同步辅助结构
struct FrameRequest {
    lock: Mutex<RequestState>,
    cvar: Condvar,
}

/// 辅助结构，用于跨线程管理 Staging Texture
struct StagingStore {
    resource: Option<ID3D11Resource>,
    desc: D3D11_TEXTURE2D_DESC,
}

/// D3D 持久化上下文容器
struct D3DContext {
    d3d_device: ID3D11Device,
    d3d_context: Arc<Mutex<ID3D11DeviceContext>>,
    winrt_device: IDirect3DDevice,
    staging_store: Arc<Mutex<StagingStore>>,
}

// 确保上下文可在线程间安全传递
unsafe impl Send for D3DContext {}
unsafe impl Sync for D3DContext {}

// 全局 D3D 上下文缓存，按显示器 ID 分组
static CONTEXTS: OnceLock<Mutex<HashMap<u32, Arc<D3DContext>>>> = OnceLock::new();

/// 获取或初始化全局上下文缓存
fn get_contexts() -> &'static Mutex<HashMap<u32, Arc<D3DContext>>> {
    CONTEXTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 根据显示器 ID 获取对应的显示器句柄 (HMONITOR)
fn get_monitor_handle(display_id: u32) -> Result<HMONITOR, Box<dyn std::error::Error>> {
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1()?;
        let mut current_id = 0u32;
        let mut adapter_idx = 0u32;

        while let Ok(adapter) = factory.EnumAdapters(adapter_idx) {
            let mut output_idx = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_idx) {
                if current_id == display_id {
                    let desc: DXGI_OUTPUT_DESC = output.GetDesc()?;
                    return Ok(desc.Monitor);
                }
                current_id += 1;
                output_idx += 1;
            }
            adapter_idx += 1;
        }
        Err("指定的显示器 ID 未找到".into())
    }
}

/// 获取或创建指定显示器的 D3D 持久化上下文
fn get_or_create_d3d_context(
    display_id: u32,
) -> Result<Arc<D3DContext>, Box<dyn std::error::Error>> {
    let mut contexts = get_contexts()
        .lock()
        .map_err(|_| "无法锁定设备上下文缓存")?;

    if let Some(ctx) = contexts.get(&display_id) {
        return Ok(ctx.clone());
    }

    unsafe {
        // 初始化 D3D11 设备与上下文
        let mut d3d_device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;

        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            None,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut d3d_device),
            None,
            Some(&mut context),
        )?;

        let d3d_device = d3d_device.ok_or("无法创建 D3D11 设备")?;
        let d3d_context = context.ok_or("无法创建 D3D11 上下文")?;

        // 将 D3D11 设备包装为 WinRT 可用的 Direct3D 设备
        let dxgi_device: IDXGIDevice = d3d_device.cast()?;
        let inspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device)?;
        let winrt_device: IDirect3DDevice = inspectable.cast()?;

        let ctx = Arc::new(D3DContext {
            d3d_device,
            d3d_context: Arc::new(Mutex::new(d3d_context)),
            winrt_device,
            staging_store: Arc::new(Mutex::new(StagingStore {
                resource: None,
                desc: D3D11_TEXTURE2D_DESC::default(),
            })),
        });

        contexts.insert(display_id, ctx.clone());
        Ok(ctx)
    }
}

/// 获取系统中所有可用的显示器信息
pub fn get_displays() -> Vec<DisplayInfo> {
    let mut displays = Vec::new();
    unsafe {
        if let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() {
            let mut adapter_idx = 0u32;
            while let Ok(adapter) = factory.EnumAdapters(adapter_idx) {
                let mut output_idx = 0u32;
                while let Ok(output) = adapter.EnumOutputs(output_idx) {
                    if let Ok(desc) = output.GetDesc() {
                        let name_len = desc
                            .DeviceName
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(desc.DeviceName.len());
                        let name = String::from_utf16_lossy(&desc.DeviceName[..name_len]);
                        displays.push(DisplayInfo {
                            id: displays.len() as u32,
                            name,
                            x: desc.DesktopCoordinates.left,
                            y: desc.DesktopCoordinates.top,
                            width: (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left)
                                as u32,
                            height: (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top)
                                as u32,
                            is_primary: adapter_idx == 0 && output_idx == 0,
                        });
                    }
                    output_idx += 1;
                }
                adapter_idx += 1;
            }
        }
    }
    displays
}

/// 执行屏幕捕获的核心函数
pub fn capture_display(
    display_id: u32,
    hdr_options: Option<crate::HdrMappingOptions>,
    capture_cursor: Option<bool>,
) -> Result<crate::CaptureResult, Box<dyn std::error::Error>> {
    let t_start = std::time::Instant::now();

    // 准备 D3D 上下文与显示器句柄
    let d3d_ctx = get_or_create_d3d_context(display_id)?;
    let monitor_handle = get_monitor_handle(display_id)?;
    let display_name = get_displays()
        .into_iter()
        .find(|d| d.id == display_id)
        .map(|d| d.name);
    let system_color_info = display_name
        .as_deref()
        .and_then(|name| crate::display_config::get_display_color_info(name).ok());
    let effective_hdr_options = hdr_options.as_ref().map(|options| {
        let mut resolved = options.clone();
        if resolved.sdr_white_nits.is_none() {
            resolved.sdr_white_nits = system_color_info.map(|info| info.sdr_white_nits);
        }
        resolved
    });

    if let Some(info) = system_color_info {
        println!(
            "[Rust-Color] display_id={} system_sdr_white_level={} system_sdr_white_nits={:.2} hdr_enabled={}",
            display_id, info.sdr_white_level, info.sdr_white_nits, info.hdr_enabled
        );
    }
    let use_hdr_capture = system_color_info.map(|info| info.hdr_enabled).unwrap_or(true);
    let frame_pool_format = if use_hdr_capture {
        DirectXPixelFormat::R16G16B16A16Float
    } else {
        DirectXPixelFormat::B8G8R8A8UIntNormalized
    };

    let t_setup = t_start.elapsed();

    unsafe {
        // 设置捕获项与帧缓冲池
        let interop = windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()?;
        let item: GraphicsCaptureItem = interop.CreateForMonitor(monitor_handle)?;

        let item_size = item.Size()?;
        let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &d3d_ctx.winrt_device,
            frame_pool_format,
            2,
            item_size,
        )?;

        // 初始化异步等待状态
        let request = Arc::new(FrameRequest {
            lock: Mutex::new(RequestState {
                pending: true,
                result: None,
            }),
            cvar: Condvar::new(),
        });

        let req_clone = Arc::clone(&request);
        let staging_store = Arc::clone(&d3d_ctx.staging_store);
        let d3d_device_raw = d3d_ctx.d3d_device.clone();
        let d3d_ctx_raw = Arc::clone(&d3d_ctx.d3d_context);

        let t_capture_start = std::time::Instant::now();

        // 注册帧到达事件
        frame_pool.FrameArrived(
            &TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(
                move |pool: &Option<Direct3D11CaptureFramePool>, _| {
                    let t_arrived = t_capture_start.elapsed();

                    let pool = match pool {
                        Some(p) => p,
                        None => return Ok(()),
                    };

                    let mut state = req_clone.lock.lock().unwrap();

                    // 检查是否仍处于等待状态
                    if !state.pending {
                        let _ = pool.TryGetNextFrame();
                        return Ok(());
                    }

                    let frame = match pool.TryGetNextFrame() {
                        Ok(f) => f,
                        Err(e) => {
                            state.result = Some(Err(format!("获取帧失败: {}", e)));
                            state.pending = false;
                            req_clone.cvar.notify_all();
                            return Ok(());
                        }
                    };

                    let content_size = frame.ContentSize().unwrap_or_default();
                    let t_proc_start = std::time::Instant::now();

                    // 具体的帧处理逻辑，包括 GPU 拷贝、解除绑定、CPU 色彩转换
                    let process_res = (|| -> Result<CachedFrame, String> {
                        let surface = frame.Surface().map_err(|e| e.to_string())?;
                        let access: IDirect3DDxgiInterfaceAccess =
                            surface.cast().map_err(|e| e.to_string())?;
                        let texture: ID3D11Texture2D =
                            access.GetInterface().map_err(|e| e.to_string())?;

                        let mut params = D3D11_TEXTURE2D_DESC::default();
                        texture.GetDesc(&mut params);

                        let mut staging_guard = staging_store.lock().unwrap();
                        let width = content_size.Width as u32;
                        let height = content_size.Height as u32;

                        // 动态检查并重建 Staging Texture，以适应分辨率或格式变化
                        if staging_guard.resource.is_none()
                            || staging_guard.desc.Width != width
                            || staging_guard.desc.Height != height
                            || staging_guard.desc.Format != params.Format
                        {
                            let desc = D3D11_TEXTURE2D_DESC {
                                Width: width,
                                Height: height,
                                MipLevels: 1,
                                ArraySize: 1,
                                Format: params.Format,
                                SampleDesc: DXGI_SAMPLE_DESC {
                                    Count: 1,
                                    Quality: 0,
                                },
                                Usage: D3D11_USAGE_STAGING,
                                BindFlags: 0,
                                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
                                MiscFlags: 0,
                            };

                            let mut new_tex: Option<ID3D11Texture2D> = None;
                            d3d_device_raw
                                .CreateTexture2D(&desc, None, Some(&mut new_tex))
                                .map_err(|e| e.to_string())?;
                            let new_tex =
                                new_tex.ok_or_else(|| "无法创建 Staging Texture".to_string())?;
                            staging_guard.resource =
                                Some(new_tex.cast().map_err(|e| e.to_string())?);
                            staging_guard.desc = desc;
                        }

                        let staging_resource = staging_guard.resource.as_ref().unwrap();
                        let src_resource: ID3D11Resource =
                            texture.cast().map_err(|e| e.to_string())?;

                        // 将纹理从视频内存拷贝到系统内存（Staging）
                        {
                            let context = d3d_ctx_raw.lock().unwrap();
                            context.CopyResource(staging_resource, &src_resource);
                        }

                        // 映射 Staging Texture 到 CPU 地址空间
                        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                        {
                            let context = d3d_ctx_raw.lock().unwrap();
                            context
                                .Map(staging_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                                .map_err(|e| e.to_string())?;
                        }

                        let row_pitch = mapped.RowPitch as usize;
                        let width_usize = width as usize;
                        let height_usize = height as usize;

                        let preserve_raw = hdr_options
                            .as_ref()
                            .and_then(|o| o.preserve_raw)
                            .unwrap_or(false);
                        let is_f16 = params.Format == DXGI_FORMAT_R16G16B16A16_FLOAT;
                        let is_bgra8 = params.Format == DXGI_FORMAT_B8G8R8A8_UNORM;

                        // 执行快速的 CPU 内存拷贝，并处理可能的内存步幅 (Stride) 差异
                        let bpp = if is_f16 { 8 } else { 4 };
                        let expected_pitch = width_usize * bpp;
                        let mut cpu_buffer = vec![0u8; height_usize * expected_pitch];
                        let src_ptr = mapped.pData as *const u8;
                        let dest_ptr = cpu_buffer.as_mut_ptr();

                        if row_pitch == expected_pitch {
                            std::ptr::copy_nonoverlapping(
                                src_ptr,
                                dest_ptr,
                                height_usize * expected_pitch,
                            );
                        } else {
                            for row in 0..height_usize {
                                std::ptr::copy_nonoverlapping(
                                    src_ptr.add(row * row_pitch),
                                    dest_ptr.add(row * expected_pitch),
                                    expected_pitch,
                                );
                            }
                        }

                        // 尽早解除纹理映射，释放 GPU 资源
                        {
                            let context = d3d_ctx_raw.lock().unwrap();
                            context.Unmap(staging_resource, 0);
                        }

                        // 进行图像处理与色彩映射（HDR -> SDR）
                        let (buffer, raw_buffer) = if is_f16 {
                            let processed = crate::image_proc::process_f16_buffer_parallel(
                                &cpu_buffer,
                                width,
                                height,
                                effective_hdr_options.as_ref(),
                            );
                            let raw = if preserve_raw { Some(cpu_buffer) } else { None };
                            (processed, raw)
                        } else if is_bgra8 {
                            let processed =
                                crate::sdr_proc::process_bgra8_buffer_parallel(&cpu_buffer, width, height);
                            (processed, None)
                        } else {
                            (cpu_buffer, None)
                        };

                        Ok(CachedFrame {
                            buffer,
                            raw_buffer,
                            width,
                            height,
                            is_hdr: is_f16,
                        })
                    })();

                    let t_proc_end = t_proc_start.elapsed();
                    println!(
                        "[Rust-Perf] 屏幕 ID={} | 等待首帧: {:?} | 处理耗时: {:?}",
                        display_id, t_arrived, t_proc_end
                    );

                    match process_res {
                        Ok(cached) => {
                            state.result = Some(Ok(crate::CaptureResult {
                                buffer: cached.buffer.into(),
                                width: cached.width,
                                height: cached.height,
                                is_hdr: cached.is_hdr,
                                raw_hdr_buffer: cached.raw_buffer.map(|v| v.into()),
                            }));
                        }
                        Err(e) => {
                            state.result = Some(Err(e));
                        }
                    }

                    state.pending = false;
                    req_clone.cvar.notify_all();

                    Ok(())
                },
            ),
        )?;

        // 启动捕获会话
        let session = frame_pool.CreateCaptureSession(&item)?;
        let _ = session.SetIsBorderRequired(false);
        let _ = session.SetIsCursorCaptureEnabled(capture_cursor.unwrap_or(false));
        session.StartCapture()?;

        // 等待捕获结果，设置 1000ms 超时以防止死锁
        let mut state = request.lock.lock().unwrap();
        let mut final_result = Err("捕获超时 (1000ms)".into());

        let (state_guard, wait_res) = request
            .cvar
            .wait_timeout(state, std::time::Duration::from_millis(1000))
            .unwrap();
        state = state_guard;

        if !wait_res.timed_out()
            && let Some(res) = state.result.take()
        {
            final_result = res.map_err(|e| e.into());
        }

        let t_total = t_start.elapsed();
        if final_result.is_ok() {
            println!(
                "[Rust-Perf] 屏幕 ID={} | 准备耗时: {:?} | 总体耗时: {:?}",
                display_id, t_setup, t_total
            );
        }

        // 显式清理 Session 和 Pool 资源
        let _ = session.Close();
        let _ = frame_pool.Close();

        final_result
    }
}
