<template>
  <v-container fluid class="bangumi-logs-shell px-4 py-5">
    <div class="mx-auto max-w-[1480px]">
      <section class="hero-panel mb-4 overflow-hidden rounded-[28px] px-5 py-5 md:px-7 md:py-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl">
            <p class="eyebrow mb-3">Bangumi Logs</p>
            <h1 class="text-3xl font-black tracking-[-.04em] md:text-5xl">
              把追番进度收进一个顺手的工作台
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-[rgb(var(--v-theme-on-surface-variant))] md:text-base">
              使用个人 Access Token 登录后，可以集中查看在看动画、搜索条目并直接更新看到哪一集。
            </p>
          </div>

          <div class="stats-strip grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div class="metric-block">
              <div class="metric-label">当前筛选</div>
              <div class="metric-value">
                {{ activeFilterLabel }}
              </div>
            </div>
            <div class="metric-block">
              <div class="metric-label">追番条目</div>
              <div class="metric-value">
                {{ state.collections.length }}
              </div>
            </div>
            <div class="metric-block sm:col-span-1 col-span-2">
              <div class="metric-label">账号状态</div>
              <div class="metric-value text-base md:text-lg">
                {{ state.authenticated ? state.viewer?.nickname || '已登录' : '未登录' }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <v-alert
        v-if="state.errorMessage"
        class="mb-4 rounded-2xl"
        type="warning"
        variant="tonal"
      >
        {{ state.errorMessage }}
      </v-alert>

      <div v-if="!state.ready" class="py-16 text-center">
        <v-progress-circular indeterminate color="primary" size="56" />
      </div>

      <div v-else-if="!state.authenticated" class="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
        <v-sheet class="login-panel rounded-[28px] px-5 py-6 md:px-7" border>
          <p class="eyebrow mb-3">手动登录</p>
          <h2 class="text-2xl font-black tracking-[-.04em] md:text-4xl">
            使用个人 Access Token 连接 Bangumi
          </h2>
          <p class="mt-4 max-w-2xl text-sm leading-6 text-[rgb(var(--v-theme-on-surface-variant))] md:text-base">
            这个插件不会帮你申请第三方应用。点击下方按钮打开 Bangumi 官方页面，生成自己的 Access Token，再回到这里粘贴并验证。
          </p>

          <div class="mt-6 flex flex-wrap gap-3">
            <v-btn
              color="primary"
              rounded="pill"
              size="large"
              prepend-icon="open_in_new"
              @click="openTokenPage"
            >
              打开 Token 页面
            </v-btn>

            <v-btn
              variant="text"
              rounded="pill"
              size="large"
              prepend-icon="refresh"
              @click="syncStatus"
            >
              重新检查状态
            </v-btn>
          </div>

          <v-textarea
            v-model="state.tokenInput"
            class="mt-8"
            label="Access Token"
            placeholder="粘贴从 Bangumi 生成的 personal access token"
            rows="6"
            auto-grow
            variant="outlined"
            hide-details="auto"
          />

          <div class="mt-4 flex flex-wrap gap-3">
            <v-btn
              color="primary"
              rounded="pill"
              size="large"
              :loading="state.authenticating"
              @click="verifyToken"
            >
              保存并验证
            </v-btn>

            <div class="tip-chip">
              Token 会保存在插件设置中，请只在你自己的设备上使用。
            </div>
          </div>
        </v-sheet>

        <v-sheet class="guide-panel rounded-[28px] px-5 py-6 md:px-7" border>
          <p class="eyebrow mb-3">接入流程</p>
          <ol class="guide-list space-y-4">
            <li><strong>1.</strong> 在 Bangumi 的 token 页面创建一个 personal access token。</li>
            <li><strong>2.</strong> 把 token 粘贴到左侧输入框，点击“保存并验证”。</li>
            <li><strong>3.</strong> 登录成功后，插件会拉取你当前“在看”的动画收藏。</li>
            <li><strong>4.</strong> 在工作台里搜索新动画、加入追番，或直接更新分集进度。</li>
          </ol>
        </v-sheet>
      </div>

      <div v-else class="dashboard-grid">
        <aside class="control-column">
          <v-sheet class="rounded-[28px] px-4 py-4 md:px-5 md:py-5" border>
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <v-avatar size="54" color="primary">
                  <v-img v-if="state.viewer?.avatar" :src="state.viewer.avatar" cover />
                  <span v-else class="text-lg font-bold">
                    {{ (state.viewer?.nickname || state.viewer?.username || 'B').slice(0, 1) }}
                  </span>
                </v-avatar>

                <div class="min-w-0">
                  <div class="truncate text-lg font-bold">
                    {{ state.viewer?.nickname }}
                  </div>
                  <div class="truncate text-sm text-[rgb(var(--v-theme-on-surface-variant))]">
                    @{{ state.viewer?.username }}
                  </div>
                </div>
              </div>

              <v-btn icon="logout" variant="text" @click="logout" />
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <v-btn
                color="primary"
                rounded="pill"
                prepend-icon="refresh"
                :loading="state.refreshing"
                @click="loadDashboard"
              >
                刷新列表
              </v-btn>
            </div>
          </v-sheet>

          <v-sheet class="rounded-[28px] px-4 py-4 md:px-5 md:py-5" border>
            <p class="eyebrow mb-3">筛选</p>
            <v-select
              :model-value="state.filterType"
              :items="filterOptions"
              label="收藏状态"
              variant="outlined"
              hide-details
              @update:model-value="loadDashboard"
            />
          </v-sheet>

          <v-sheet class="rounded-[28px] px-4 py-4 md:px-5 md:py-5" border>
            <div class="flex items-center justify-between gap-3">
              <p class="eyebrow">搜索并加入追番</p>
              <v-btn
                icon="search"
                variant="text"
                :loading="state.searching"
                @click="searchSubjects"
              />
            </div>

            <v-text-field
              v-model="state.searchKeyword"
              class="mt-3"
              label="搜索动画"
              variant="outlined"
              hide-details
              placeholder="输入动画标题"
              append-inner-icon="search"
              @keydown.enter.prevent="searchSubjects"
              @click:append-inner="searchSubjects"
            />

            <div v-if="state.searchKeyword && !state.searchResults.length && !state.searching" class="search-empty mt-4">
              没有搜索结果，试试原始标题或简短关键词。
            </div>

            <div v-if="state.searchResults.length" class="mt-4 space-y-3">
              <article
                v-for="item in state.searchResults"
                :key="item.id"
                class="search-item"
              >
                <div class="flex gap-3">
                  <v-avatar rounded="lg" size="60">
                    <v-img v-if="item.cover" :src="item.cover" cover />
                    <div v-else class="search-avatar-fallback">
                      {{ item.title.slice(0, 1) }}
                    </div>
                  </v-avatar>

                  <div class="min-w-0 flex-1">
                    <div class="truncate font-semibold">
                      {{ item.title }}
                    </div>
                    <div class="truncate text-xs text-[rgb(var(--v-theme-on-surface-variant))]">
                      {{ item.originalTitle || '无原始标题' }}
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2 text-xs text-[rgb(var(--v-theme-on-surface-variant))]">
                      <span>评分 {{ item.score || '暂无' }}</span>
                      <span v-if="item.eps">共 {{ item.eps }} 话</span>
                    </div>
                  </div>
                </div>

                <v-btn
                  class="mt-3"
                  color="primary"
                  variant="tonal"
                  rounded="pill"
                  block
                  :loading="actionLoading"
                  @click="collectSubject(item.id)"
                >
                  加入在看
                </v-btn>
              </article>
            </div>
          </v-sheet>
        </aside>

        <main class="content-column">
          <section class="rounded-[28px] border border-[rgb(var(--v-theme-outline-variant))] bg-[rgb(var(--v-theme-surface))] px-4 py-4 md:px-5">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="eyebrow">追番列表</p>
                <h2 class="text-2xl font-black tracking-[-.04em]">
                  {{ activeFilterLabel }}
                </h2>
              </div>
              <div class="text-sm text-[rgb(var(--v-theme-on-surface-variant))]">
                共 {{ state.collections.length }} 项
              </div>
            </div>

            <div v-if="!state.collections.length" class="empty-panel">
              当前筛选下还没有动画。你可以先在左侧搜索并加入“在看”。
            </div>

            <div v-else class="collection-list">
              <button
                v-for="item in state.collections"
                :key="item.subjectId"
                type="button"
                class="collection-item"
                :class="{ 'collection-item--active': item.subjectId === state.selectedSubjectId }"
                @click="loadEpisodes(item.subjectId)"
              >
                <div class="flex gap-4">
                  <v-avatar rounded="xl" size="84">
                    <v-img v-if="item.cover" :src="item.cover" cover />
                    <div v-else class="search-avatar-fallback">
                      {{ item.title.slice(0, 1) }}
                    </div>
                  </v-avatar>

                  <div class="min-w-0 flex-1 text-left">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="truncate text-lg font-bold">
                        {{ item.title }}
                      </h3>
                      <v-chip size="small" :color="item.collectionTypeTone" variant="tonal">
                        {{ item.collectionTypeLabel }}
                      </v-chip>
                    </div>

                    <div class="truncate text-sm text-[rgb(var(--v-theme-on-surface-variant))]">
                      {{ item.originalTitle || '无原始标题' }}
                    </div>

                    <p class="mt-3 line-clamp-2 text-sm leading-6 text-[rgb(var(--v-theme-on-surface-variant))]">
                      {{ item.summary || '暂无简介。' }}
                    </p>

                    <div class="mt-4 flex flex-wrap gap-4 text-sm">
                      <span>进度 {{ item.progressText }}</span>
                      <span v-if="item.score">评分 {{ item.score }}</span>
                      <span v-if="item.rank">Rank {{ item.rank }}</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </section>

          <section class="rounded-[28px] border border-[rgb(var(--v-theme-outline-variant))] bg-[rgb(var(--v-theme-surface))] px-4 py-4 md:px-5">
            <div v-if="!selectedCollection" class="empty-panel">
              选择一部动画后，这里会显示分集和快捷操作。
            </div>

            <template v-else>
              <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div class="min-w-0">
                  <p class="eyebrow">条目详情</p>
                  <h2 class="mt-2 text-2xl font-black tracking-[-.04em]">
                    {{ selectedCollection.title }}
                  </h2>
                  <p class="mt-2 text-sm text-[rgb(var(--v-theme-on-surface-variant))]">
                    {{ selectedCollection.originalTitle || '无原始标题' }}
                  </p>
                </div>

                <v-select
                  class="min-w-[220px]"
                  :model-value="selectedCollection.collectionType"
                  :items="filterOptions"
                  label="收藏状态"
                  variant="outlined"
                  hide-details
                  @update:model-value="updateCollectionType(selectedCollection.subjectId, $event)"
                />
              </div>

              <div class="mt-5 detail-banner rounded-[24px] px-4 py-4">
                <div class="flex flex-wrap items-center gap-3 text-sm">
                  <span>当前进度 {{ selectedCollection.progressText }}</span>
                  <span v-if="selectedCollection.score">评分 {{ selectedCollection.score }}</span>
                  <span v-if="selectedCollection.rank">Rank {{ selectedCollection.rank }}</span>
                </div>
              </div>

              <div class="mt-5 flex items-center gap-3">
                <p class="eyebrow">分集进度</p>
                <v-progress-circular v-if="detailLoading" indeterminate size="18" width="2" color="primary" />
              </div>

              <div v-if="!selectedEpisodes.length && !detailLoading" class="empty-panel mt-4">
                当前没有可展示的分集数据。请先确认该条目已加入收藏。
              </div>

              <div v-else class="episode-grid mt-4">
                <article
                  v-for="episode in selectedEpisodes"
                  :key="episode.id"
                  class="episode-item"
                  :class="{ 'episode-item--watched': episode.watched }"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-sm text-[rgb(var(--v-theme-on-surface-variant))]">
                        第 {{ episode.sort || '?' }} 话
                      </div>
                      <div class="truncate text-base font-semibold">
                        {{ episode.title }}
                      </div>
                    </div>

                    <v-chip
                      size="small"
                      :color="episode.watched ? 'primary' : 'surface-variant'"
                      :variant="episode.watched ? 'flat' : 'tonal'"
                    >
                      {{ episode.watched ? '已看' : '未看' }}
                    </v-chip>
                  </div>

                  <div class="mt-4 flex flex-wrap gap-2">
                    <v-btn
                      size="small"
                      rounded="pill"
                      color="primary"
                      variant="tonal"
                      :disabled="episode.watched || actionLoading"
                      @click="markEpisodeWatched(episode.id)"
                    >
                      标记已看
                    </v-btn>
                    <v-btn
                      size="small"
                      rounded="pill"
                      variant="text"
                      :disabled="actionLoading"
                      @click="markProgressToEpisode(selectedCollection.subjectId, episode.id)"
                    >
                      看到这里
                    </v-btn>
                  </div>
                </article>
              </div>
            </template>
          </section>
        </main>
      </div>
    </div>
  </v-container>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { SUBJECT_FILTER_OPTIONS } from '../shared/constants.js';
import { useBangumiLogs } from './useBangumiLogs.js';

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
  loadEpisodes,
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

onMounted(async () => {
  await syncStatus();

  if (state.authenticated) {
    await loadDashboard(state.filterType);
  }
});
</script>

<style>
@layer tailwind {
  @layer theme, utilities;
  @import 'tailwindcss/theme.css' layer(theme);
  @import 'tailwindcss/utilities.css' layer(utilities);
}
</style>

<style scoped>
.bangumi-logs-shell {
  min-height: 100%;
  background:
    radial-gradient(circle at top right, rgb(var(--v-theme-primary) / .11), transparent 28%),
    linear-gradient(180deg, rgb(var(--v-theme-surface-bright)) 0%, rgb(var(--v-theme-surface)) 100%);
}

.hero-panel,
.login-panel,
.guide-panel,
.search-item,
.episode-item {
  border: 1px solid rgb(var(--v-theme-outline-variant));
  background: rgb(var(--v-theme-surface));
}

.hero-panel {
  position: relative;
  background:
    linear-gradient(135deg, rgb(var(--v-theme-surface-bright)) 0%, rgb(var(--v-theme-surface)) 45%, rgb(var(--v-theme-primary) / .08) 100%);
}

.hero-panel::after {
  position: absolute;
  inset: auto -5% -22% auto;
  width: 260px;
  height: 260px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary) / .12);
  content: '';
  filter: blur(24px);
  pointer-events: none;
}

.eyebrow {
  letter-spacing: .22em;
  text-transform: uppercase;
  font-size: .72rem;
  font-weight: 700;
  color: rgb(var(--v-theme-primary));
}

.stats-strip {
  min-width: min(100%, 420px);
}

.metric-block,
.tip-chip,
.detail-banner,
.empty-panel,
.search-empty {
  border-radius: 22px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  background: rgb(var(--v-theme-surface-container-low));
}

.metric-block {
  padding: 14px 16px;
}

.metric-label {
  font-size: .75rem;
  color: rgb(var(--v-theme-on-surface-variant));
}

.metric-value {
  margin-top: 8px;
  font-size: 1.2rem;
  font-weight: 800;
  line-height: 1.1;
}

.guide-list {
  padding-left: 0;
  list-style: none;
}

.guide-list li {
  line-height: 1.8;
}

.tip-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 16px;
  min-height: 44px;
  color: rgb(var(--v-theme-on-surface-variant));
}

.dashboard-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
  align-items: start;
}

.control-column,
.content-column {
  display: grid;
  gap: 16px;
}

.collection-list {
  display: grid;
  gap: 12px;
}

.collection-item {
  width: 100%;
  padding: 16px;
  border-radius: 24px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  background: rgb(var(--v-theme-surface-container-low));
  transition: transform .24s ease, border-color .24s ease, background-color .24s ease;
}

.collection-item:hover,
.collection-item--active {
  transform: translateY(-1px);
  border-color: rgb(var(--v-theme-primary) / .4);
  background: rgb(var(--v-theme-surface-container));
}

.episode-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.episode-item {
  border-radius: 22px;
  padding: 16px;
  transition: transform .2s ease, border-color .2s ease;
}

.episode-item--watched {
  border-color: rgb(var(--v-theme-primary) / .4);
  background: rgb(var(--v-theme-primary) / .06);
}

.search-avatar-fallback {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 800;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
}

.search-item {
  border-radius: 20px;
  padding: 14px;
}

.detail-banner,
.empty-panel,
.search-empty {
  padding: 14px 16px;
}

@media (max-width: 1180px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
</style>
