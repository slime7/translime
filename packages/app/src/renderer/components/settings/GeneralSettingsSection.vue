<template>
  <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
    <div class="text-mat-label-large text-primary">
      通用
    </div>

    <mat-list
      variant="segmented"
      interaction="single-action"
      class="settings-list mt-2"
    >
      <mat-list-item
        data-test="setting-auto-start"
        @click="onOpenAtLogin(!settings.openAtLogin)"
      >
        开机自动启动
        <template #trailing>
          <mat-switch
            :model-value="settings.openAtLogin"
            class="pointer-events-none"
            color="primary"
            aria-hidden="true"
          />
        </template>
      </mat-list-item>
      <mat-list-item
        data-test="setting-minimize-tray"
        @click="onMinimizeToTrayOnClose(!settings.minimizeToTrayOnClose)"
      >
        关闭时最小化到托盘
        <template #trailing>
          <mat-switch
            :model-value="settings.minimizeToTrayOnClose"
            class="pointer-events-none"
            color="primary"
            aria-hidden="true"
          />
        </template>
      </mat-list-item>
      <mat-list-item
        data-test="setting-show-dev-plugin"
        @click="onShowDevPlugin(!settings.showDevPlugin)"
      >
        显示开发中插件(重启后生效)
        <template #trailing>
          <mat-switch
            :model-value="settings.showDevPlugin"
            class="pointer-events-none"
            color="primary"
            aria-hidden="true"
          />
        </template>
      </mat-list-item>
    </mat-list>

    <mat-list
      variant="segmented"
      interaction="single-action"
      class="settings-list mt-2"
    >
      <mat-list-item @click="showDevtools">
        打开 devtools(F12)
      </mat-list-item>
      <mat-list-item @click="relaunch">
        重新启动
      </mat-list-item>
    </mat-list>
  </div>
</template>

<script setup>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore } from '@/utils';

const ipc = useIpc();
const store = useGlobalStore();
const settings = store.appSetting;

const onOpenAtLogin = (value) => {
  ipc.send(ipcType.OPEN_AT_LOGIN, {
    open: !!value,
  });
  store.setAppOpenAtLogin(!!value);
};

const onMinimizeToTrayOnClose = (value) => {
  appConfigStore.set('setting.minimizeToTrayOnClose', !!value);
  store.setAppMinimizeToTrayOnClose(!!value);
};

const onShowDevPlugin = (isShow) => {
  ipc.send(ipcType.SHOW_DEV_PLUGIN, {
    isShow: !!isShow,
  });
  store.setShowDevPlugin(!!isShow);
};

const showDevtools = () => {
  ipc.send(ipcType.DEVTOOLS);
};

const relaunch = () => {
  ipc.send(ipcType.RELAUNCH);
};
</script>

<style scoped>
.settings-list {
  border-radius: 16px;
}
</style>
