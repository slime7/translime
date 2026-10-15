<template>
  <mat-app-root
    :fill-viewport="false"
    class="h-full overflow-hidden"
  >
    <!-- 页面只保留列表一个滚动容器，避免双滚动条叠加 -->
    <div class="flex h-full flex-col gap-3 overflow-hidden p-3">
      <!-- 设备行：下拉占满剩余宽度，操作按钮不压缩 -->
      <div class="flex shrink-0 items-center gap-2">
        <mat-select
          v-model="serial"
          class="min-w-0 grow"
          block
          label="设备"
          placeholder="选择设备"
          :items="deviceItems"
          :disabled="loadingDevices || devices.length === 0"
        />
        <mat-btn
          icon="refresh"
          label="刷新设备"
          variant="text"
          class="shrink-0"
          :loading="loadingDevices"
          @click="loadDevices"
        />
        <mat-btn
          icon="wifi_tethering"
          label="无线调试配对"
          variant="text"
          class="shrink-0"
          @click="openPairDialog"
        />
        <mat-btn
          v-if="selectedStoredWireless"
          icon="link_off"
          label="移除已保存的无线设备"
          variant="text"
          class="shrink-0"
          :disabled="forgetting"
          :loading="forgetting"
          @click="forgetWireless"
        />
      </div>

      <mat-btn
        variant="filled"
        class="shrink-0 self-start"
        :disabled="!serial || launching"
        :loading="launching"
        @click="launch('mirror')"
      >
        <template #prefix>
          cast
        </template>
        镜像整屏
      </mat-btn>

      <div
        v-if="error"
        role="alert"
        class="shrink-0 rounded-lg bg-[var(--mat-sys-color-error-container)] px-3 py-2 text-sm break-all text-[var(--mat-sys-color-on-error-container)]"
      >
        {{ error }}
      </div>

      <mat-search
        v-model="keyword"
        class="shrink-0"
        label="过滤应用包名"
        placeholder="过滤应用包名"
      />

      <div class="min-h-0 grow overflow-y-auto">
        <div
          v-if="loadingApps"
          class="flex h-full items-center justify-center"
        >
          <mat-progress
            indeterminate
            class="w-48"
            aria-label="加载应用列表"
          />
        </div>
        <div
          v-else-if="apps.length === 0"
          class="flex h-full items-center justify-center text-sm text-[var(--mat-sys-color-on-surface-variant)]"
        >
          {{ serial ? '未获取到应用列表' : '请先连接设备' }}
        </div>
        <div
          v-else-if="filteredApps.length === 0"
          class="flex h-full items-center justify-center text-sm text-[var(--mat-sys-color-on-surface-variant)]"
        >
          无匹配应用
        </div>
        <mat-list
          v-else
          interaction="multi-action"
        >
          <mat-list-item
            v-for="pkg in filteredApps"
            :key="pkg"
            :value="pkg"
          >
            {{ pkg }}
            <template #trailing>
              <mat-btn
                icon="cast"
                label="镜像（先在手机上拉起该应用）"
                size="small"
                variant="standard"
                :disabled="launching"
                @click="launch('mirror', pkg)"
              />
              <mat-btn
                icon="picture_in_picture"
                label="虚拟屏"
                size="small"
                variant="standard"
                :disabled="launching"
                @click="launch('virtual', pkg)"
              />
            </template>
          </mat-list-item>
        </mat-list>
      </div>
    </div>

    <mat-dialog
      v-model="pairOpen"
      title="无线调试配对"
      :width="420"
      close-on-back
    >
      <mat-tabs
        v-model="pairMode"
        variant="secondary"
      >
        <mat-tab-item
          value="qr"
          label="扫码配对"
        />
        <mat-tab-item
          value="code"
          label="配对码配对"
        />

        <mat-tab-content value="qr">
          <div class="flex flex-col items-center gap-3 py-3">
            <p class="self-start text-sm text-[var(--mat-sys-color-on-surface-variant)]">
              手机进入 开发者选项 → 无线调试 → 使用二维码配对设备，扫描下方二维码。
            </p>
            <div
              v-if="qrPayload"
              class="rounded-lg bg-white p-3"
            >
              <QrcodeVue
                :value="qrPayload"
                :size="200"
                level="M"
                render-as="canvas"
                aria-label="无线调试配对二维码"
              />
            </div>
            <div
              v-if="qrPolling"
              class="flex items-center gap-2 text-sm text-[var(--mat-sys-color-on-surface-variant)]"
            >
              <mat-progress
                indeterminate
                class="w-32"
                aria-label="等待手机扫码"
              />
              等待手机扫码…
            </div>
            <div
              v-if="pairError"
              role="alert"
              class="self-stretch rounded-lg bg-[var(--mat-sys-color-error-container)] px-3 py-2 text-sm break-all text-[var(--mat-sys-color-on-error-container)]"
            >
              {{ pairError }}
            </div>
          </div>
        </mat-tab-content>

        <mat-tab-content value="code">
          <div class="flex flex-col gap-3 py-3">
            <p class="text-sm text-[var(--mat-sys-color-on-surface-variant)]">
              手机进入 无线调试 → 使用配对码配对设备，按配对页显示的内容填写。
            </p>
            <mat-text-field
              v-model="codeForm.address"
              block
              label="配对地址 (IP:端口)"
              placeholder="192.168.1.5:37849"
              :disabled="pairing"
            />
            <mat-text-field
              v-model="codeForm.pairingCode"
              block
              label="配对码"
              placeholder="123456"
              :disabled="pairing"
              :max-length="6"
            />
            <div
              v-if="pairError"
              role="alert"
              class="rounded-lg bg-[var(--mat-sys-color-error-container)] px-3 py-2 text-sm break-all text-[var(--mat-sys-color-on-error-container)]"
            >
              {{ pairError }}
            </div>
          </div>
        </mat-tab-content>
      </mat-tabs>
      <template #actions>
        <mat-spacer />
        <mat-btn
          variant="text"
          :disabled="pairing"
          @click="pairOpen = false"
        >
          取消
        </mat-btn>
        <mat-btn
          v-if="pairMode === 'code'"
          variant="filled"
          :loading="pairing"
          @click="pairByCode"
        >
          配对并连接
        </mat-btn>
      </template>
    </mat-dialog>
  </mat-app-root>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import QrcodeVue from 'qrcode.vue';
import { useIpc } from 'translime-sdk';

defineOptions({
  name: 'ScrcpyWrapperUi',
});

const id = 'translime-plugin-scrcpy-wrapper';
const ipc = useIpc(id);

const devices = ref([]);
const serial = ref('');
const apps = ref([]);
const keyword = ref('');
const loadingDevices = ref(false);
const loadingApps = ref(false);
const launching = ref(false);
const error = ref('');

const createCodeForm = () => ({ address: '', pairingCode: '' });

const pairOpen = ref(false);
const pairMode = ref('qr');
const pairing = ref(false);
const pairError = ref('');
const codeForm = ref(createCodeForm());
const forgetting = ref(false);

const QR_TOTAL_TIMEOUT_MS = 120000;

const qrPayload = ref('');
const qrSecrets = ref(null);
const qrPolling = ref(false);

const deviceItems = computed(() => devices.value.map((device) => {
  const base = device.model ? `${device.model} (${device.serial})` : device.serial;
  return {
    title: device.wireless && !device.connected ? `${base} · 未连接` : base,
    value: device.serial,
  };
}));

const selectedStoredWireless = computed(() => devices.value.some(
  (device) => device.serial === serial.value && device.stored && device.wireless,
));

const filteredApps = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) {
    return apps.value;
  }
  return apps.value.filter((pkg) => pkg.toLowerCase().includes(kw));
});

const loadDevices = async () => {
  loadingDevices.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('list-devices');
    if (!result?.success) {
      throw new Error(result?.message || '获取设备列表失败');
    }
    devices.value = result.devices;
    // 刷新保留当前选择（含已保存但离线的无线设备），仅在无效时回落到首台设备
    const stillAvailable = result.devices.some((device) => device.serial === serial.value);
    serial.value = stillAvailable && serial.value
      ? serial.value
      : (result.devices[0]?.serial ?? '');
  } catch (e) {
    devices.value = [];
    serial.value = '';
    apps.value = [];
    error.value = e.message;
  } finally {
    loadingDevices.value = false;
  }
};

const loadApps = async () => {
  if (!serial.value) {
    apps.value = [];
    return;
  }
  loadingApps.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('list-apps', serial.value);
    if (!result?.success) {
      throw new Error(result?.message || '获取应用列表失败');
    }
    apps.value = result.packages;
  } catch (e) {
    apps.value = [];
    error.value = e.message;
  } finally {
    loadingApps.value = false;
  }
};

const launch = async (mode, pkg = null) => {
  if (!serial.value || launching.value) {
    return;
  }
  launching.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('launch', { mode, serial: serial.value, pkg });
    if (!result?.success) {
      throw new Error(result?.message || '启动失败');
    }
    // 已保存的无线设备端口变化时主进程会重连并回报实际 serial
    if (result.serial && result.serial !== serial.value) {
      serial.value = result.serial;
      await loadDevices();
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    launching.value = false;
  }
};

const openPairDialog = () => {
  codeForm.value = createCodeForm();
  pairError.value = '';
  pairMode.value = 'qr';
  qrPayload.value = '';
  qrSecrets.value = null;
  pairOpen.value = true;
  startQrPairing();
};

const applyPairSuccess = async (result) => {
  pairOpen.value = false;
  await loadDevices();
  if (result.serial) {
    serial.value = result.serial;
  }
};

const startQrPairing = async () => {
  if (qrPolling.value) {
    return;
  }
  qrPolling.value = true;
  pairError.value = '';
  try {
    const created = await ipc.invoke('create-wireless-qr');
    if (!created?.success) {
      throw new Error(created?.message || '生成配对二维码失败');
    }
    qrSecrets.value = { name: created.name, password: created.password };
    qrPayload.value = created.payload;
    const knownSerials = devices.value.map((device) => device.serial);
    const deadline = Date.now() + QR_TOTAL_TIMEOUT_MS;
    while (qrPolling.value && Date.now() < deadline) {
      const result = await ipc.invoke('wait-wireless-qr-pairing', {
        name: created.name,
        password: created.password,
        knownSerials,
      });
      if (result?.success) {
        await applyPairSuccess(result);
        return;
      }
      if (!result?.pending) {
        throw new Error(result?.message || '配对失败');
      }
    }
    if (qrPolling.value) {
      pairError.value = '等待扫码超时，请重新打开配对窗口重试；也可改用「配对码配对」';
    }
  } catch (e) {
    if (qrPolling.value) {
      pairError.value = e.message;
    }
  } finally {
    qrPolling.value = false;
  }
};

const pairByCode = async () => {
  if (pairing.value) {
    return;
  }
  pairing.value = true;
  pairError.value = '';
  try {
    const result = await ipc.invoke('pair-wireless', {
      address: codeForm.value.address.trim(),
      pairingCode: codeForm.value.pairingCode.trim(),
    });
    if (!result?.success) {
      throw new Error(result?.message || '配对失败');
    }
    await applyPairSuccess(result);
  } catch (e) {
    pairError.value = e.message;
  } finally {
    pairing.value = false;
  }
};

const forgetWireless = async () => {
  if (!serial.value || forgetting.value) {
    return;
  }
  forgetting.value = true;
  error.value = '';
  try {
    const result = await ipc.invoke('remove-wireless', { serial: serial.value });
    if (!result?.success) {
      throw new Error(result?.message || '移除失败');
    }
    await loadDevices();
  } catch (e) {
    error.value = e.message;
  } finally {
    forgetting.value = false;
  }
};

watch(serial, () => {
  keyword.value = '';
  loadApps();
});

// dialog 关闭（含帷幕点击与 Escape）即停止扫码轮询
watch(pairOpen, (open) => {
  if (!open) {
    qrPolling.value = false;
  }
});

onMounted(loadDevices);
</script>

<!-- 不引入 Preflight：插件样式经宿主 @scope 隔离注入，重置层会破坏 mde 组件基础样式 -->
<style>
@layer tailwind {
  @layer theme, utilities;
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
}
</style>
