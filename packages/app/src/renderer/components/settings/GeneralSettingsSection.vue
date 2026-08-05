<template>
  <div class="mb-4 break-inside-avoid w-full max-w-100 mx-auto">
    <div class="text-primary">
      通用
    </div>

    <mde-list class="mt-2">
      <mde-list-item
        title="开机自动启动"
        item-type="switch"
        :is-active="settings.openAtLogin"
        @click="onOpenAtLogin(!settings.openAtLogin)"
      />
      <mde-list-item
        title="关闭时最小化到托盘"
        item-type="switch"
        :is-active="settings.minimizeToTrayOnClose"
        @click="onMinimizeToTrayOnClose(!settings.minimizeToTrayOnClose)"
      />
      <mde-list-item
        title="显示开发中插件(重启后生效)"
        item-type="switch"
        :is-active="settings.showDevPlugin"
        @click="onShowDevPlugin(!settings.showDevPlugin)"
      />
    </mde-list>

    <mde-list class="mt-2">
      <mde-list-item
        title="打开 devtools(F12)"
        @click="showDevtools"
      />
      <mde-list-item
        title="重新启动"
        @click="relaunch"
      />
    </mde-list>
  </div>
</template>

<script setup>
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import useGlobalStore from '@/store/globalStore';
import { appConfigStore } from '@/utils';
import MdeList from '@/components/MdeList.vue';
import MdeListItem from '@/components/MdeListItem.vue';

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
