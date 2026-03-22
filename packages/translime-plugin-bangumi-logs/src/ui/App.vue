<template>
  <v-container fluid class="bg-background min-h-full py-8 px-4 sm:px-6 lg:px-8" style="overflow-y: auto;">
    <div class="mx-auto max-w-[1400px] flex flex-col gap-8">
      <!-- Loading State -->
      <div v-if="!state.ready" class="flex justify-center items-center py-32">
        <v-progress-circular indeterminate color="primary" size="64" width="4" />
      </div>

      <!-- Unauthenticated State -->
      <div v-else-if="!state.authenticated" class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section class="lg:col-span-8 rounded-[2rem] bg-surface p-8 sm:p-12 border border-outline-variant/30 shadow-sm flex flex-col justify-center">
          <div class="mb-10">
            <span class="text-primary font-bold tracking-widest text-xs uppercase mb-3 block">手动登录</span>
            <h2 class="text-3xl font-extrabold tracking-tight text-on-surface mb-3">
              使用 Access Token 连接
            </h2>
            <p class="text-on-surface-variant text-base">
              前往 Bangumi 官方页面生成个人访问令牌 (Personal Access Token)，然后在此验证。<br>
              <span class="opacity-80 mt-2 block">Token 将安全地保存在本地插件配置中。</span>
            </p>
          </div>

          <div class="flex flex-wrap gap-4 mb-10">
            <v-btn
              color="primary"
              variant="flat"
              size="large"
              rounded="pill"
              class="px-8 font-medium tracking-wide"
              prepend-icon="open_in_new"
              @click="openTokenPage"
            >
              获取 Token
            </v-btn>
            <v-btn
              variant="tonal"
              color="secondary"
              size="large"
              rounded="pill"
              class="px-8 font-medium tracking-wide"
              prepend-icon="refresh"
              @click="syncStatus"
            >
              检查登录状态
            </v-btn>
          </div>

          <div class="bg-surface-container-lowest p-6 rounded-[1.5rem] border border-outline-variant/50">
            <label class="block text-sm font-bold text-on-surface mb-3 ml-1">Access Token</label>
            <v-text-field
              v-model="state.tokenInput"
              placeholder="粘贴从 Bangumi 复制的 token..."
              variant="solo"
              flat
              bg-color="surface-container"
              hide-details
              class="rounded-xl custom-textfield"
            >
              <template #prepend-inner>
                <v-icon icon="vpn_key" color="primary" class="mr-2" />
              </template>
            </v-text-field>
            <div class="mt-6 flex flex-col gap-4">
              <v-btn
                color="primary"
                variant="flat"
                size="large"
                rounded="pill"
                class="px-10 font-medium tracking-wide self-end"
                :loading="state.authenticating"
                @click="verifyToken"
              >
                保存并连接
              </v-btn>
              <v-alert
                v-if="state.errorMessage"
                type="error"
                variant="tonal"
                class="rounded-xl w-full"
              >
                {{ state.errorMessage }}
              </v-alert>
            </div>
          </div>
        </section>

        <section class="lg:col-span-4 rounded-[2rem] bg-surface-container-lowest p-8 border border-outline-variant/30 flex flex-col justify-center">
          <span class="text-primary font-bold tracking-widest text-xs uppercase mb-6 block">快速指南</span>
          <div class="flex flex-col gap-8 relative">
            <div class="absolute left-4 top-4 bottom-4 w-px bg-outline-variant/40" />

            <div class="relative flex gap-5">
              <div class="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm shrink-0 shadow-sm z-10">
                1
              </div>
              <div>
                <h3 class="font-bold text-on-surface mb-1">
                  创建 Token
                </h3>
                <p class="text-on-surface-variant text-sm leading-relaxed">
                  在 Bangumi 设置中新建一个 Personal Access Token。
                </p>
              </div>
            </div>
            <div class="relative flex gap-5">
              <div class="w-8 h-8 rounded-full bg-surface-container-high border border-outline text-on-surface flex items-center justify-center font-bold text-sm shrink-0 z-10">
                2
              </div>
              <div>
                <h3 class="font-bold text-on-surface mb-1">
                  粘贴验证
                </h3>
                <p class="text-on-surface-variant text-sm leading-relaxed">
                  将 Token 复制到左侧输入框并点击连接。
                </p>
              </div>
            </div>
            <div class="relative flex gap-5">
              <div class="w-8 h-8 rounded-full bg-surface-container-high border border-outline text-on-surface flex items-center justify-center font-bold text-sm shrink-0 z-10">
                3
              </div>
              <div>
                <h3 class="font-bold text-on-surface mb-1">
                  同步数据
                </h3>
                <p class="text-on-surface-variant text-sm leading-relaxed">
                  成功后，插件会自动拉取你当前的追番列表。
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Authenticated Dashboard Area -->
      <div v-else class="flex flex-col gap-8">
        <!-- Header / Hero Section -->
        <header class="dashboard-header rounded-[2rem] bg-surface p-8 sm:p-12 border border-outline-variant/30 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div class="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div class="relative z-10 max-w-2xl">
            <span class="text-primary font-bold tracking-widest text-xs uppercase mb-3 block">Bangumi Logs</span>
            <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight text-on-surface mb-4">
              追番列表与进度更新
            </h1>
            <p class="text-lg text-on-surface-variant leading-relaxed">
              集中管理你的追番进度。登录后可以拉取在看条目、搜索新动画，并把进度直接同步到 Bangumi。
            </p>
          </div>

          <div class="relative z-10 flex flex-wrap gap-4 p-5 rounded-3xl bg-surface-container-lowest border border-outline-variant/50">
            <div class="flex flex-col px-4 border-r border-outline-variant/50">
              <span class="text-xs text-on-surface-variant font-bold tracking-wider uppercase mb-1">默认筛选</span>
              <span class="text-xl font-black text-on-surface">{{ activeFilterLabel }}</span>
            </div>
            <div class="flex flex-col px-4 border-r border-outline-variant/50">
              <span class="text-xs text-on-surface-variant font-bold tracking-wider uppercase mb-1">条目数量</span>
              <span class="text-xl font-black text-on-surface">{{ state.collections.length }}</span>
            </div>
            <div class="flex flex-col px-4 min-w-[120px]">
              <span class="text-xs text-on-surface-variant font-bold tracking-wider uppercase mb-1">账号状态</span>
              <span class="text-lg font-bold text-primary truncate max-w-[120px]">
                {{ state.viewer?.nickname || '就绪' }}
              </span>
            </div>
          </div>
        </header>

        <div class="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <!-- Left Sidebar -->
          <aside class="xl:col-span-1 flex flex-col gap-6">
            <!-- User Profile Card -->
            <div class="rounded-3xl bg-surface p-6 border border-outline-variant/30 shadow-sm flex flex-col items-center text-center outline-avatar-container">
              <v-avatar size="80" class="mb-4 shadow-sm ring-4 ring-surface ring-offset-2 ring-offset-primary/10">
                <v-img v-if="state.viewer?.avatar" :src="state.viewer.avatar" cover />
                <span v-else class="text-3xl font-bold bg-primary text-on-primary w-full h-full flex items-center justify-center">
                  {{ (state.viewer?.nickname || state.viewer?.username || 'B').slice(0, 1) }}
                </span>
              </v-avatar>
              <h3 class="text-xl font-bold text-on-surface truncate w-full px-2">
                {{ state.viewer?.nickname }}
              </h3>
              <p class="text-sm text-on-surface-variant mb-6 truncate w-full">
                @{{ state.viewer?.username }}
              </p>

              <div class="w-full flex items-center gap-3">
                <v-btn
                  color="primary"
                  variant="flat"
                  rounded="pill"
                  class="flex-1 font-medium"
                  prepend-icon="refresh"
                  :loading="state.refreshing"
                  @click="loadDashboard(state.filterType)"
                >
                  刷新列表
                </v-btn>
                <v-btn
                  variant="tonal"
                  color="error"
                  icon="logout"
                  rounded="lg"
                  class="shrink-0"
                  size="default"
                  @click="logout"
                />
              </div>
            </div>

            <!-- Filters -->
            <div class="rounded-3xl bg-surface p-6 border border-outline-variant/30 shadow-sm">
              <span class="text-primary font-bold tracking-widest text-xs uppercase mb-4 block">查看筛选</span>
              <v-select
                :model-value="state.filterType"
                :items="filterOptions"
                variant="solo-filled"
                flat
                bg-color="surface-container-lowest"
                hide-details
                class="rounded-xl custom-textfield"
                @update:model-value="loadDashboard"
              >
                <template #selection="{ item }">
                  <span class="font-bold text-on-surface">{{ item.title }}</span>
                </template>
              </v-select>
            </div>

            <!-- Search Area -->
            <div class="rounded-3xl bg-surface p-6 border border-outline-variant/30 shadow-sm flex flex-col bg-gradient-to-b from-surface to-surface-container-lowest">
              <div class="flex items-center justify-between mb-4 shrink-0 flex-none">
                <span class="text-primary font-bold tracking-widest text-xs uppercase block">搜索条目</span>
                <v-progress-circular v-if="state.searching" indeterminate size="20" width="2" color="primary" />
              </div>

              <div class="shrink-0 flex-none mb-4">
                <v-text-field
                  v-model="state.searchKeyword"
                  variant="solo"
                  flat
                  density="comfortable"
                  bg-color="surface-container"
                  placeholder="输入动画标题..."
                  hide-details
                  class="rounded-xl custom-textfield"
                  @keydown.enter.prevent="searchSubjects"
                >
                  <template #append-inner>
                    <v-icon icon="search" class="cursor-pointer hover:text-primary transition-colors" @click="searchSubjects" />
                  </template>
                </v-text-field>
              </div>

              <div v-if="state.searchKeyword && !state.searchResults.length && !state.searching" class="text-sm text-on-surface-variant text-center py-6 bg-surface-container-highest/20 rounded-xl shrink-0 flex-none">
                未找到相关条目
              </div>

              <div v-if="state.searchResults.length" class="flex flex-col gap-4 overflow-y-auto max-h-[500px] xl:max-h-none pr-2 custom-scrollbar flex-1">
                <div
                  v-for="item in state.searchResults"
                  :key="item.id"
                  class="search-item-card group p-3 rounded-[1.25rem] bg-surface border border-outline-variant/20 transition-all duration-300 flex flex-col gap-3"
                >
                  <div class="flex gap-4">
                    <v-avatar rounded="xl" size="64" class="shadow-sm border border-outline-variant/20 bg-surface-variant">
                      <v-img v-if="item.cover" :src="item.cover" cover />
                      <div v-else class="w-full h-full text-on-surface-variant flex items-center justify-center font-bold text-xl">
                        {{ item.title.slice(0, 1) }}
                      </div>
                    </v-avatar>
                    <div class="flex-1 min-w-0 py-1 flex flex-col justify-center">
                      <h4 class="font-bold text-on-surface text-sm truncate mb-1">
                        {{ item.title }}
                      </h4>
                      <p class="text-xs text-on-surface-variant truncate mb-2">
                        {{ item.originalTitle || '未知原始标题' }}
                      </p>
                      <div class="flex gap-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                        <span class="bg-surface-container px-2 py-1 rounded-md" v-if="item.score">★ {{ item.score }}</span>
                        <span class="bg-surface-container px-2 py-1 rounded-md" v-if="item.eps">{{ item.eps }} 话</span>
                      </div>
                    </div>
                  </div>
                  <v-btn
                    color="primary"
                    variant="tonal"
                    rounded="xl"
                    size="small"
                    class="w-full font-bold shadow-sm opacity-90 group-hover:opacity-100 transition-opacity"
                    :loading="actionLoading"
                    @click="collectSubject(item.id)"
                  >
                    加入收藏
                  </v-btn>
                </div>
              </div>
            </div>
          </aside>

          <!-- Main Content (Collections List) -->
          <main class="xl:col-span-3">
            <div class="rounded-[2rem] bg-surface p-6 sm:p-10 border border-outline-variant/30 shadow-sm min-h-full flex flex-col">
              <div class="flex flex-col sm:flex-row items-start sm:items-end justify-between border-b border-outline-variant/40 pb-6 mb-8 gap-4">
                <div>
                  <span class="text-primary font-bold tracking-widest text-xs uppercase mb-2 block">{{ activeFilterLabel }}</span>
                  <h2 class="text-3xl font-extrabold tracking-tight text-on-surface">
                    我的追番
                  </h2>
                </div>
                <div class="text-on-surface-variant font-bold bg-surface-container-high px-4 py-2 rounded-full text-sm">
                  共 <span class="text-primary font-black">{{ state.collections.length }}</span> 部
                </div>
              </div>

              <div v-if="!state.collections.length" class="flex flex-col items-center justify-center py-32 text-center flex-1">
                <v-icon icon="auto_awesome_motion" size="64" class="text-outline-variant/50 mb-6" />
                <h3 class="text-xl font-bold text-on-surface mb-2">
                  当前列表为空
                </h3>
                <p class="text-on-surface-variant max-w-sm">
                  在此分类下没有找到动画。可以在左侧搜索并加入。
                </p>
              </div>

              <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start content-start">
                <div
                  v-for="item in state.collections"
                  :key="item.subjectId"
                  class="collection-card group flex flex-col p-5 rounded-[1.5rem] bg-surface-container-lowest border border-outline-variant/40 cursor-pointer overflow-hidden relative"
                  @click="openCollectionDetail(item.subjectId)"
                >
                  <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  <div class="flex gap-5 relative z-10 w-full h-full">
                    <div class="w-24 shrink-0 flex flex-col h-full">
                      <div class="aspect-[3/4] rounded-2xl overflow-hidden shadow-sm bg-surface-variant cover-wrapper border border-outline-variant/20">
                        <v-img v-if="item.cover" :src="item.cover" cover class="w-full h-full" />
                        <div v-else class="w-full h-full flex flex-col items-center justify-center text-on-surface-variant font-bold text-3xl">
                          {{ item.title.slice(0, 1) }}
                        </div>
                      </div>
                    </div>

                    <div class="flex-1 min-w-0 flex flex-col pt-1 w-full">
                      <div class="flex items-start justify-between gap-2 mb-2 w-full">
                        <h3 class="text-lg font-bold text-on-surface leading-tight line-clamp-2 group-hover:text-primary transition-colors flex-1" :title="item.title">
                          {{ item.title }}
                        </h3>
                        <v-chip size="x-small" :color="item.collectionTypeTone" variant="tonal" class="font-bold shrink-0">
                          {{ item.collectionTypeLabel }}
                        </v-chip>
                      </div>

                      <p class="text-xs text-on-surface-variant mb-3 truncate w-full" :title="item.originalTitle">
                        {{ item.originalTitle || '未知' }}
                      </p>

                      <div class="mt-auto pt-3 border-t border-outline-variant/30 w-full">
                        <div class="flex justify-between items-end">
                          <div>
                            <span class="text-[0.65rem] font-bold text-medium-emphasis uppercase tracking-widest block mb-1 leading-none">当前进度</span>
                            <span class="text-sm font-black text-primary leading-none block">{{ item.progressText }}</span>
                          </div>
                          <v-icon icon="arrow_forward" size="small" class="text-medium-emphasis opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>

    <!-- Detail Dialog -->
    <v-dialog
      :model-value="state.detailDialogOpen"
      max-width="960"
      transition="dialog-bottom-transition"
      @update:model-value="handleDetailDialogChange"
    >
      <v-card class="rounded-[2rem] overflow-hidden bg-surface shadow-2xl border border-outline-variant/30">
        <template v-if="selectedCollection">
          <v-btn
            icon="close"
            variant="tonal"
            size="small"
            color="on-surface"
            class="absolute top-4 right-4 z-20 bg-surface/50 backdrop-blur"
            @click="closeCollectionDetail"
          />
          <div class="overflow-y-auto max-h-[85vh] custom-scrollbar">
            <div class="relative bg-surface-container-lowest border-b border-outline-variant/30 overflow-hidden shrink-0">
              <div class="absolute inset-0 opacity-10 blur-3xl pointer-events-none scale-110" :style="selectedCollection.cover ? `background-image: url(${selectedCollection.cover}); background-size: cover; background-position: center;` : ''" />

              <div class="relative z-10 p-6 sm:p-10 flex flex-col sm:flex-row gap-8">
                <div class="w-32 sm:w-48 shrink-0 mx-auto sm:mx-0">
                  <div class="aspect-[3/4] rounded-2xl overflow-hidden shadow-lg border border-outline-variant/20 bg-surface-variant">
                    <v-img v-if="selectedCollection.cover" :src="selectedCollection.cover" cover class="w-full h-full" />
                    <div v-else class="w-full h-full flex items-center justify-center font-bold text-5xl text-on-surface-variant">
                      {{ selectedCollection.title.slice(0, 1) }}
                    </div>
                  </div>
                </div>

                <div class="flex-1 flex flex-col min-w-0">
                  <div class="mb-4">
                    <v-chip size="small" :color="selectedCollection.collectionTypeTone" variant="tonal" class="mb-3 font-bold px-3">
                      {{ selectedCollection.collectionTypeLabel }}
                    </v-chip>
                    <h2 class="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-on-surface leading-tight mb-2">
                      {{ selectedCollection.title }}
                    </h2>
                    <p class="text-sm text-on-surface-variant">
                      {{ selectedCollection.originalTitle || '未知原始标题' }}
                    </p>
                  </div>

                  <p class="text-sm text-on-surface-variant leading-relaxed line-clamp-3 sm:line-clamp-4 mb-6 custom-scrollbar pr-2" style="overflow-y: auto;">
                    {{ selectedCollection.summary || '暂无简介' }}
                  </p>

                  <div class="mt-auto flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div class="flex gap-4 p-3 bg-surface rounded-xl border border-outline-variant/30">
                      <div class="flex flex-col px-3 border-r border-outline-variant/30">
                        <span class="text-[0.65rem] font-bold text-medium-emphasis uppercase tracking-widest mb-1 leading-none">评分</span>
                        <span class="text-lg font-black text-on-surface leading-none">{{ selectedCollection.score || '-' }}</span>
                      </div>
                      <div class="flex flex-col px-3 border-r border-outline-variant/30">
                        <span class="text-[0.65rem] font-bold text-medium-emphasis uppercase tracking-widest mb-1 leading-none">排名</span>
                        <span class="text-lg font-black text-on-surface leading-none">{{ selectedCollection.rank ? `#${selectedCollection.rank}` : '-' }}</span>
                      </div>
                      <div class="flex flex-col px-3">
                        <span class="text-[0.65rem] font-bold text-medium-emphasis uppercase tracking-widest mb-1 leading-none">总进度</span>
                        <span class="text-lg font-black text-primary leading-none">{{ selectedCollection.progressText }}</span>
                      </div>
                    </div>

                    <div class="w-full sm:w-auto min-w-[200px]">
                      <v-select
                        :model-value="selectedCollection.collectionType"
                        :items="filterOptions"
                        variant="outlined"
                        density="comfortable"
                        hide-details
                        bg-color="surface"
                        class="custom-textfield font-bold"
                        @update:model-value="updateCollectionType(selectedCollection.subjectId, $event)"
                      >
                        <template #selection="{ item }">
                          <span class="font-bold px-1">{{ item.title }}</span>
                        </template>
                      </v-select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="p-6 sm:p-10 bg-surface min-h-[400px]">
              <div class="flex items-center gap-4 mb-8">
                <h3 class="text-xl font-extrabold text-on-surface">
                  分集进度
                </h3>
                <v-progress-circular v-if="detailLoading" indeterminate size="24" width="3" color="primary" />
              </div>

              <div v-if="!selectedEpisodes.length && !detailLoading" class="flex flex-col items-center justify-center py-20 bg-surface-container-lowest rounded-3xl border border-outline-variant/30">
                <v-icon icon="history" size="48" class="text-outline-variant/50 mb-4" />
                <p class="text-on-surface-variant font-medium">
                  无分集数据，请确认条目已加入收藏
                </p>
              </div>

              <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div
                  v-for="episode in selectedEpisodes"
                  :key="episode.id"
                  class="flex flex-col p-4 rounded-2xl border transition-all duration-300 group"
                  :class="episode.watched ? 'bg-primary/5 border-primary/30' : 'bg-surface border-outline-variant/40 hover:border-outline-variant'"
                >
                  <div class="flex justify-between items-start mb-3 gap-2">
                    <span class="bg-surface-container-high border border-outline-variant/20 text-on-surface font-black text-xs px-2.5 py-1 rounded-lg shrink-0">
                      {{ episode.sort || '?' }} 话
                    </span>
                    <v-chip
                      size="small"
                      :color="episode.watched ? 'primary' : 'surface-variant'"
                      :variant="episode.watched ? 'flat' : 'tonal'"
                      class="font-bold shrink-0"
                    >
                      {{ episode.watched ? '已看' : '未看' }}
                    </v-chip>
                  </div>

                  <h4 class="font-bold text-on-surface text-sm mb-4 line-clamp-2 leading-snug flex-1">
                    {{ episode.title }}
                  </h4>

                  <div class="flex gap-2 mt-auto w-full">
                    <v-btn
                      size="small"
                      rounded="lg"
                      color="primary"
                      variant="flat"
                      class="flex-1 font-bold tracking-wide shadow-none"
                      :disabled="episode.watched || actionLoading"
                      @click="markEpisodeWatched(episode.id)"
                    >
                      标记
                    </v-btn>
                    <v-btn
                      size="small"
                      rounded="lg"
                      variant="tonal"
                      color="secondary"
                      class="flex-1 font-bold tracking-wide"
                      :disabled="actionLoading"
                      @click="markProgressToEpisode(selectedCollection.subjectId, episode.id)"
                    >
                      看到这
                    </v-btn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { SUBJECT_FILTER_OPTIONS } from '../shared/constants';
import { useBangumiLogs } from './useBangumiLogs';

defineOptions({
  name: 'BangumiLogsApp',
});

const {
  state,
  detailLoading,
  actionLoading,
  selectedCollection,
  selectedEpisodes,
  filterOptions,
  syncStatus,
  verifyToken,
  logout,
  loadDashboard,
  openCollectionDetail,
  closeCollectionDetail,
  searchSubjects,
  collectSubject,
  updateCollectionType,
  markEpisodeWatched,
  markProgressToEpisode,
  openTokenPage,
} = useBangumiLogs();

const activeFilterLabel = computed(() => SUBJECT_FILTER_OPTIONS.find(
  (item) => Number(item.value) === Number(state.filterType),
)?.title || '在看');

const handleDetailDialogChange = (value) => {
  if (!value) {
    closeCollectionDetail();
  }
};

onMounted(async () => {
  await syncStatus();

  if (state.authenticated) {
    await loadDashboard(state.filterType);
  }
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgb(var(--v-theme-outline-variant), .5);
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgb(var(--v-theme-outline-variant));
}

.search-item-card:hover {
  background: rgb(var(--v-theme-surface-container-low));
  border-color: rgb(var(--v-theme-outline-variant));
}

.collection-card {
  transition: transform .3s cubic-bezier(.2, 0, 0, 1), box-shadow .3s cubic-bezier(.2, 0, 0, 1), border-color .3s ease;
  height: 154px;
}

.collection-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -8px rgb(var(--v-shadow-color), .15) !important;
  border-color: rgb(var(--v-theme-primary), .4);
}

.cover-wrapper .v-img {
  transition: transform .3s ease;
}

.collection-card:hover .cover-wrapper .v-img {
  transform: scale(1.05);
}

.custom-textfield :deep(.v-field) {
  border-radius: 1rem;
}
</style>
