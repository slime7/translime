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

        <div class="mt-4 md:mt-0 min-w-72">
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

      <div v-if="filteredPlugins.length > 0" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4 gap-3 md:gap-4">
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
              class="plugin-entry ease-standard rounded-3xl w-full cursor-pointer"
              @click="openPlugin(plugin)"
            >
              <div class="flex items-center gap-3 px-3 py-3">
                <v-avatar
                  :color="isHovering ? 'primary-container' : 'surface-container-high'"
                  rounded
                  class="plugin-entry__avatar ease-standard shrink-0 size-14 rounded-3xl"
                >
                  <v-img v-if="plugin.plugin?.icon || plugin.icon" :src="plugin.plugin?.icon || plugin.icon" />
                  <v-icon
                    v-else
                    :color="isHovering ? 'primary' : 'on-surface-variant'"
                    class="text-2xl"
                  >
                    extension
                  </v-icon>
                </v-avatar>

                <div class="min-w-0 grow">
                  <div class="text-body-large font-medium truncate">
                    {{ plugin.plugin?.title || plugin.title || plugin.packageName }}
                  </div>
                </div>

                <v-btn
                  :color="isPinned(plugin.packageName) ? 'primary' : 'on-surface-variant'"
                  :variant="isPinned(plugin.packageName) ? 'tonal' : 'text'"
                  size="small"
                  icon
                  rounded="pill"
                  class="plugin-entry__pin ease-standard shrink-0"
                  :aria-label="isPinned(plugin.packageName) ? '取消固定到侧栏' : '固定到侧栏'"
                  @click.stop="togglePin(plugin.packageName)"
                >
                  <v-icon class="text-lg">
                    push_pin
                  </v-icon>

                  <v-tooltip activator="parent" location="top">
                    {{ isPinned(plugin.packageName) ? '取消固定到侧栏' : '固定到侧栏' }}
                  </v-tooltip>
                </v-btn>
              </div>
            </v-card>
          </v-hover>
        </div>
      </div>

      <div
        v-else
        class="flex flex-col items-center justify-center py-16 mt-8"
      >
        <v-avatar color="surface-container-highest" class="mb-4 size-20 rounded-full" rounded>
          <v-icon class="text-4xl" color="on-surface-variant">
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
    openPluginWindow(plugin);
    return;
  }

  router.push({ name: 'PluginPage', params: { packageName: plugin.packageName } });
};
</script>

<style scoped lang="scss">
.plugin-entry {
  border: 1px solid rgb(var(--v-theme-outline-variant), .65);
  transition-property: transform, box-shadow, border-color, background-color;

  &:hover {
    transform: translateY(-1px);
    border-color: rgb(var(--v-theme-outline), .85);
    background-color: rgb(var(--v-theme-surface-container));
  }
}

.plugin-entry__avatar {
  transition-property: background-color, transform;
}

.plugin-entry__pin {
  transition-property: background-color, color, transform;

  &:hover {
    transform: scale(1.04);
  }
}
</style>
