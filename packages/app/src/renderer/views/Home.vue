<template>
  <v-container fluid class="home h-full flex items-start p-6 md:p-8">
    <div class="w-full max-w-7xl mx-auto mt-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 class="text-4xl font-bold mb-2">
            应用中心
          </h1>
          <p class="text-lg text-black/60 dark:text-white/60">
            探索和管理所有已安装的 Translime 插件
          </p>
        </div>

        <div class="mt-4 md:mt-0" style="min-width: 300px;">
          <v-text-field
            v-model="searchQuery"
            variant="solo-filled"
            flat
            density="comfortable"
            prepend-inner-icon="search"
            placeholder="搜索插件..."
            hide-details
            rounded
            class="rounded-full shadow-none"
            bg-color="surface-container-highest"
          />
        </div>
      </div>

      <div v-if="filteredPlugins.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <div
          v-for="plugin in filteredPlugins"
          :key="plugin.packageName"
          class="flex"
        >
          <v-hover v-slot="{ isHovering, props }">
            <v-card
              v-bind="props"
              :elevation="isHovering ? 2 : 0"
              variant="flat"
              color="surface-container-low"
              rounded
              class="rounded-[24px] w-full flex flex-col transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.5,1)] cursor-pointer"
              @click="openPlugin(plugin)"
            >
              <v-card-item class="pt-6 px-6">
                <template #prepend>
                  <v-avatar
                    :color="isHovering ? 'primary' : 'primary-container'"
                    size="56"
                    rounded
                    class="rounded-lg transition-colors border"
                    :class="isHovering ? 'border-primary' : 'border-transparent'"
                  >
                    <v-img v-if="plugin.plugin?.icon || plugin.icon" :src="plugin.plugin?.icon || plugin.icon" />
                    <v-icon
                      v-else
                      :color="isHovering ? 'on-primary' : 'on-primary-container'"
                    >
                      extension
                    </v-icon>
                  </v-avatar>
                </template>

                <v-card-title class="text-xl font-bold truncate ml-2">
                  {{ plugin.plugin?.title || plugin.title || plugin.packageName }}
                </v-card-title>
              </v-card-item>

              <v-card-text class="grow px-6 pt-2 pb-0 opacity-80 line-clamp-2">
                {{ plugin.plugin?.description || plugin.description || '暂无描述信息' }}
              </v-card-text>

              <v-card-actions class="px-4 pb-4 pt-4 mt-auto">
                <div class="grow" />
                <v-btn
                  :color="isPinned(plugin.packageName) ? 'primary' : 'on-surface-variant'"
                  :variant="isPinned(plugin.packageName) ? 'tonal' : 'text'"
                  rounded
                  class="rounded-full font-medium px-4 transition-colors lowercase-none"
                  @click.stop="togglePin(plugin.packageName)"
                >
                  <v-icon start size="small">
                    push_pin
                  </v-icon>
                  {{ isPinned(plugin.packageName) ? '已固定' : '固定到侧栏' }}
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-hover>
        </div>
      </div>

      <div
        v-else
        class="flex flex-col items-center justify-center py-16 mt-8"
      >
        <v-avatar color="surface-container-highest" size="80" class="mb-4 rounded-full" rounded>
          <v-icon size="40" color="on-surface-variant">
            search_off
          </v-icon>
        </v-avatar>
        <h3 class="text-xl font-medium mb-2">
          未找到匹配的插件
        </h3>
        <p class="text-base opacity-70">
          请尝试使用其他关键词，或者在插件管理器中安装新插件
        </p>
      </div>
    </div>
  </v-container>
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
    openPluginWindow(plugin, store.dark, store.appSetting);
    return;
  }

  router.push({ name: 'PluginPage', params: { packageName: plugin.packageName } });
};
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lowercase-none {
  text-transform: none !important;
}
</style>
