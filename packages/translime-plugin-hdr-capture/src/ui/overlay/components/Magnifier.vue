<script setup>
import {
  computed, markRaw, onMounted, onUnmounted, ref, watch,
} from 'vue';

const props = defineProps({
  // 鼠标在 Overlay 坐标系下的位置
  cursorPos: {
    type: Object,
    required: true,
  },
  // 屏幕列表，包含 { x, y, width, height, url }，x/y 为绝对坐标
  screens: {
    type: Array,
    default: () => [],
  },
  // 全局偏移量
  offsetX: {
    type: Number,
    default: 0,
  },
  offsetY: {
    type: Number,
    default: 0,
  },
  zoom: {
    type: Number,
    default: 5, // 放大倍率
  },
  size: {
    type: Number,
    default: 140, // 放大镜直径
  },
});

const canvasRef = ref(null);
const loadedImages = ref([]);

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 使得图像绘制更加清晰（像素化），适合放大镜效果
  ctx.imageSmoothingEnabled = false;

  const {
    size, zoom, cursorPos, offsetX, offsetY,
  } = props;
  const dpr = window.devicePixelRatio || 1;
  const actualSize = size * dpr;

  // 设置 canvas 尺寸
  if (canvas.width !== actualSize) {
    canvas.width = actualSize;
    canvas.height = actualSize;
  }

  // 清空
  ctx.clearRect(0, 0, actualSize, actualSize);

  // 绘制背景 (纯色兜底)
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, actualSize, actualSize);

  // 绝对坐标系下的鼠标位置
  const absX = cursorPos.x + offsetX;
  const absY = cursorPos.y + offsetY;

  // 计算源图像中需要截取的区域大小 (source size)
  // 放大镜显示区域 actualSize / zoom 即为原始像素覆盖范围
  // 为了方便，我们在 Canvas 上先绘制放大的图像，无需 scale context
  // 而是通过 drawImage 参数控制

  // 视口半径 (在原图上的逻辑半径)
  const srcRadius = (size / 2) / zoom;

  // 遍历所有屏幕，找到与[absX - srcRadius, absX + srcRadius]有交集的部分进行绘制
  // 这样即使跨屏也能正确显示（只要屏幕是拼接的）

  const drawArea = {
    left: absX - srcRadius,
    top: absY - srcRadius,
    right: absX + srcRadius,
    bottom: absY + srcRadius,
  };

  loadedImages.value.forEach((screen) => {
    if (!screen.img || !screen.img.complete || screen.img.naturalWidth === 0) {
      return;
    }

    // 屏幕在绝对坐标系下的范围 (逻辑坐标)
    const bounds = screen.bounds || screen;
    const sLeft = Number(bounds.x);
    const sTop = Number(bounds.y);
    const sWidth = Number(bounds.width);
    const sHeight = Number(bounds.height);
    const sRight = sLeft + sWidth;
    const sBottom = sTop + sHeight;

    // 计算图像的缩放比例 (物理像素 / 逻辑像素)
    const scaleX = screen.img.naturalWidth / sWidth;
    const scaleY = screen.img.naturalHeight / sHeight;

    // 计算交集 (逻辑坐标)
    const iLeft = Math.max(drawArea.left, sLeft);
    const iTop = Math.max(drawArea.top, sTop);
    const iRight = Math.min(drawArea.right, sRight);
    const iBottom = Math.min(drawArea.bottom, sBottom);

    if (iLeft < iRight && iTop < iBottom) {
      // 存在交集，进行绘制

      // 源图像坐标 (source x, y, w, h) -> 需要转换为物理坐标
      const sx = (iLeft - sLeft) * scaleX;
      const sy = (iTop - sTop) * scaleY;
      const sw = (iRight - iLeft) * scaleX;
      const sh = (iBottom - iTop) * scaleY;

      // 目标 Canvas 坐标 (dest x, y, w, h)
      // 需要将交集部分映射到放大镜视口中，使用 Canvas 像素坐标 (乘以 dpr)
      const dx = (iLeft - drawArea.left) * zoom * dpr;
      const dy = (iTop - drawArea.top) * zoom * dpr;
      const dw = (iRight - iLeft) * zoom * dpr;
      const dh = (iBottom - iTop) * zoom * dpr;

      try {
        ctx.drawImage(screen.img, sx, sy, sw, sh, dx, dy, dw, dh);
      } catch (e) {
        // ignore
      }
    }
  });

  // 绘制十字准星
  const cx = actualSize / 2;
  const cy = actualSize / 2;

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(33, 150, 243, 0.5)'; // Blue
  ctx.lineWidth = 1 * dpr;

  // 横线
  ctx.moveTo(0, cy);
  ctx.lineTo(actualSize, cy);
  // 竖线
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, actualSize);
  ctx.stroke();

  // 绘制中心点红点 (精确像素)
  ctx.fillStyle = '#FF5252';
  const pointSize = 2 * dpr;
  ctx.fillRect(cx - pointSize / 2, cy - pointSize / 2, pointSize, pointSize);

  // 绘制外边框 (Canvas 内部画一圈)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1 * dpr; // 内描边细一点
  ctx.strokeRect(0, 0, actualSize, actualSize);

  // 坐标文字信息
  const fontSize = 12 * dpr;
  ctx.font = `${fontSize}px monospace`;

  // 文字背景条
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, actualSize - fontSize - 8 * dpr, actualSize, fontSize + 8 * dpr);

  // 文字
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(absX)}, ${Math.round(absY)}`, cx, actualSize - 6 * dpr);
}

// 预加载图片对象
watch(() => props.screens, (newScreens) => {
  // 清理旧图片引用
  const images = loadedImages.value;
  for (let i = 0; i < images.length; i += 1) {
    const item = images[i];
    if (item.img) {
      item.img.onload = null;
    }
  }

  // 重新映射
  loadedImages.value = newScreens.map((s) => {
    const img = new Image();
    img.src = s.url;
    // 确保图片加载完成后触发重绘
    img.onload = () => requestAnimationFrame(draw);
    return { ...s, img: markRaw(img) };
  });

  // 强制立即重绘一次以清空画布（避免在图片加载间隙显示上一帧）
  const canvas = canvasRef.value;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const actualSize = props.size * dpr;
    ctx?.clearRect(0, 0, actualSize, actualSize);
  }
}, { immediate: true, deep: true });

onUnmounted(() => {
  const images = loadedImages.value;
  for (let i = 0; i < images.length; i += 1) {
    const item = images[i];
    if (item.img) item.img.onload = null;
  }
  loadedImages.value = [];
});

// 放大镜位置：跟随鼠标，但在旁边显示
const magnifierPos = computed(() => {
  const { x, y } = props.cursorPos;
  // 默认显示在右下
  let left = x + 20;
  let top = y + 20;

  // 简单的边界检测（假设 Overlay 大小即视口大小）
  if (left + props.size > window.innerWidth) {
    left = x - props.size - 20;
  }
  if (top + props.size > window.innerHeight) {
    top = y - props.size - 20;
  }

  return { left, top };
});

// 监听鼠标位置变化进行重绘
watch(() => props.cursorPos, () => {
  requestAnimationFrame(draw);
}, { deep: true, immediate: true });

onMounted(() => {
  // 再次确保加载
  setTimeout(draw, 200);
});
</script>

<template>
  <div
    class="magnifier"
    :style="{
      width: size + 'px',
      height: size + 'px',
      left: magnifierPos.left + 'px',
      top: magnifierPos.top + 'px',
    }"
  >
    <canvas ref="canvasRef" :style="{ width: '100%', height: '100%' }" />
  </div>
</template>

<style scoped>
.magnifier {
  position: absolute;
  border-radius: 4px; /* 方形圆角 */
  overflow: hidden;
  box-shadow: 0 4px 12px rgb(0 0 0 / 50%), 0 0 0 1px rgb(255 255 255 / 20%);
  pointer-events: none; /* 穿透点击 */
  z-index: 9999;
  background: #000;
  border: 1px solid rgb(255 255 255 / 50%);
}
</style>
