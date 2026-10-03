<script setup>
import { computed, ref } from 'vue';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';
import TitleBarMenuItem from './TitleBarMenuItem.vue';

/**
 * 插件页顶栏按钮区（inspect 旁）。
 *
 * 数据源是插件主进程经 SDK setTitleBarActions 动态声明、由宿主序列化下发
 * 的 plugin.titleBarItems：直按钮与下拉菜单（Electron Menu 模板风格）。
 * 点击回传 run-title-bar-action 通道，由主进程按 id 路径执行插件注册的函数。
 */
const props = defineProps({
  plugin: {
    type: Object,
    required: true,
  },
});

const ipc = useIpc();

const items = computed(() => props.plugin?.titleBarItems || []);

// 每个下拉按钮独立的展开状态
const openMenus = ref({});
const toggleMenu = (id) => {
  openMenus.value[id] = !openMenus.value[id];
};

const triggerId = (id) => `plugin-title-action-${props.plugin.packageName}-${id}`;

const runAction = (item) => {
  ipc.invoke(ipcType.RUN_TITLE_BAR_ACTION, {
    packageName: props.plugin.packageName,
    id: item.id,
  });
};
</script>

<template>
  <div
    v-if="items.length > 0"
    data-test="plugin-title-bar-actions"
    class="flex-none flex items-center gap-1 mr-2"
  >
    <template v-for="item in items" :key="item.id">
      <template v-if="item.type === 'submenu'">
        <mat-btn
          :id="triggerId(item.id)"
          variant="standard"
          :shape="item.iconOnly ? 'square' : undefined"
          size="small"
          :disabled="item.enabled === false"
          :aria-haspopup="'menu'"
          :aria-expanded="Boolean(openMenus[item.id])"
          :aria-label="item.label"
          :suffix="openMenus[item.id] ? 'expand_less' : 'expand_more'"
          @click="toggleMenu(item.id)"
        >
          <mat-icon
            v-if="item.icon"
            :icon="item.icon"
          />
          <span v-if="!item.iconOnly">{{ item.label }}</span>
        </mat-btn>
        <mat-menu
          v-model="openMenus[item.id]"
          :anchor="triggerId(item.id)"
        >
          <title-bar-menu-item
            v-for="child in item.children"
            :key="child.id || child.type"
            :item="child"
            @select="runAction"
          />
        </mat-menu>
      </template>

      <mat-tooltip
        v-else-if="item.iconOnly"
        :content="item.tooltip || item.label"
        location="bottom"
      >
        <template #activator>
          <mat-btn
            :icon="item.icon"
            variant="standard"
            shape="square"
            size="small"
            :disabled="item.enabled === false"
            :aria-label="item.tooltip || item.label"
            @click="runAction(item)"
          />
        </template>
      </mat-tooltip>

      <mat-btn
        v-else
        variant="standard"
        size="small"
        :disabled="item.enabled === false"
        :prefix="item.icon"
        @click="runAction(item)"
      >
        {{ item.label }}
      </mat-btn>
    </template>
  </div>
</template>
