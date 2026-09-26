<template>
  <mat-container fluid class="home h-full flex items-start">
    <div class="w-full max-w-7xl mx-auto">
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 class="text-mat-headline-large mb-2">
            应用中心
          </h1>
          <p class="text-mat-body-large text-on-surface-variant">
            探索和管理所有已安装的 Translime 插件
          </p>
        </div>

        <div class="mt-4 md:mt-0 min-w-72">
          <mat-search
            v-model="searchQuery"
            label="搜索插件"
            placeholder="搜索插件..."
          />
        </div>
      </div>

      <div v-if="filteredPlugins.length > 0" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4 gap-3 md:gap-4">
        <mat-card
          v-for="plugin in filteredPlugins"
          :key="plugin.packageName"
          data-test="home-plugin-entry"
          variant="filled"
          color="surface-container-low"
          class="home-card rounded-3xl overflow-hidden"
        >
          <mat-card-action-area
            class="home-entry"
            @click="openPlugin(plugin)"
          >
            <mat-avatar
              v-if="plugin.plugin?.icon || plugin.icon"
              :src="plugin.plugin?.icon || plugin.icon"
              size="48"
              class="home-entry__avatar shrink-0"
            />
            <mat-avatar
              v-else
              icon="extension"
              size="48"
              class="home-entry__avatar shrink-0"
            />

            <div class="min-w-0 text-left">
              <div class="text-mat-title-medium truncate">
                {{ plugin.plugin?.title || plugin.title || plugin.packageName }}
              </div>
            </div>
          </mat-card-action-area>

          <mat-btn
            class="home-pin"
            :variant="isPinned(plugin.packageName) ? 'filled-tonal' : 'text'"
            :color="isPinned(plugin.packageName) ? 'primary' : 'on-surface-variant'"
            icon="push_pin"
            :label="isPinned(plugin.packageName) ? '取消固定到侧栏' : '固定到侧栏'"
            :aria-label="isPinned(plugin.packageName) ? '取消固定到侧栏' : '固定到侧栏'"
            @click="togglePin(plugin.packageName)"
          />
        </mat-card>
      </div>

      <div
        v-else
        class="flex flex-col items-center justify-center py-16 mt-8"
      >
        <div class="mb-4 size-20 rounded-full bg-surface-container-highest flex items-center justify-center">
          <mat-icon class="text-4xl text-on-surface-variant">
            search_off
          </mat-icon>
        </div>
        <h3 class="text-mat-title-large mb-2">
          未找到匹配的插件
        </h3>
        <p class="text-mat-body-large text-on-surface-variant">
          请尝试使用其他关键词，或者在插件管理器中安装新插件
        </p>
      </div>
    </div>
  </mat-container>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import useGlobalStore from '../store/globalStore';
import { openPluginWindow } from '@/utils';

const store = useGlobalStore();
const router = useRouter();
const searchQuery = ref('');

const availablePlugins = computed(() => store.plugins.filter(
  (plugin) => plugin.enabled && !(!plugin.ui && !plugin.windowUrl),
));

const filteredPlugins = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();

  if (!query) {
    return availablePlugins.value;
  }

  return availablePlugins.value.filter((plugin) => {
    const title = (plugin.plugin?.title || plugin.title || plugin.packageName).toLowerCase();
    const description = (plugin.plugin?.description || plugin.description || '').toLowerCase();

    return title.includes(query) || description.includes(query);
  });
});

const isPinned = (packageName) => store.appSetting?.pinnedPlugins?.includes(packageName);

const togglePin = async (packageName) => {
  await store.togglePinPlugin(packageName);
};

const openPlugin = (plugin) => {
  if (plugin.windowMode) {
    openPluginWindow(plugin);
    return;
  }

  router.push({ name: 'PluginPage', params: { packageName: plugin.packageName } });
};
</script>

<style scoped>
.home-card {
  position: relative;
}

/*
 * action-area 渲染为 button 并铺满整卡，state layer 因此覆盖整卡；
 * 内部的 __content span 会打断 flex 链，横向排版作用于该 span
 */
.home-entry {
  padding: 12px 60px 12px 12px;
}

.home-entry :deep(.mat-card-action-area__content) {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}

.home-entry__avatar {
  transition: transform .25s cubic-bezier(.4, 0, .2, 1);
}

.home-entry:active .home-entry__avatar {
  transform: scale(.94);
}

/* 图钉与 action-area 同级，浮于其上，避免按钮嵌套按钮 */
.home-pin {
  position: absolute;
  top: 50%;
  right: 8px;
  z-index: 2;
  translate: 0 -50%;
}
</style>
