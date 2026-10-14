<template>
  <div class="wrapper-root">
    <div class="hint">
      <span>等待画面接入…</span>
    </div>
    <div class="control-bar">
      <mat-btn
        icon="arrow_back"
        label="返回"
        variant="text"
        :disabled="sending"
        @click="sendKey(KEYCODE_BACK)"
      />
      <mat-btn
        icon="home"
        label="主页"
        variant="text"
        :disabled="sending"
        @click="sendKey(KEYCODE_HOME)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineOptions({
  name: 'ScrcpyWrapperApp',
});

const KEYCODE_BACK = 4;
const KEYCODE_HOME = 3;

const sessionId = new URLSearchParams(window.location.search).get('session') ?? '';
const sending = ref(false);

const sendKey = async (keycode) => {
  if (sending.value) {
    return;
  }
  sending.value = true;
  try {
    await window.scrcpyWrapper?.sendKey(sessionId, keycode);
  } finally {
    sending.value = false;
  }
};
</script>

<!-- 高度 48px 与主进程 BAR_CSS_HEIGHT 一致：SDL 子窗口按客户区减该高度定位 -->
<style scoped>
.wrapper-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #000;
}

.hint {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.55);
  font: 14px system-ui, sans-serif;
}

.control-bar {
  display: flex;
  flex: none;
  gap: 12px;
  align-items: center;
  justify-content: center;
  height: 48px;
  background: #0a0a0a;
}
</style>
