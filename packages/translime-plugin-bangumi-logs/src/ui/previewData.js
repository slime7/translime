import { SUBJECT_COLLECTION_TYPES } from '../shared/constants.js';

const collectionState = {
  viewer: {
    id: 1,
    username: 'preview-user',
    nickname: '预览用户',
    sign: 'Preview mode',
    avatar: '',
  },
  token: 'preview-token',
  filterType: SUBJECT_COLLECTION_TYPES.DOING,
  collections: [
    {
      id: 101,
      subjectId: 101,
      title: '葬送的芙莉莲',
      originalTitle: '葬送のフリーレン',
      cover: '',
      summary: '和寿命漫长的精灵一起慢慢向前的旅程。',
      eps: 28,
      watchedEpisodes: 14,
      progressText: '14/28',
      score: 8.8,
      rank: 12,
      collectionType: SUBJECT_COLLECTION_TYPES.DOING,
      collectionTypeLabel: '在看',
      collectionTypeTone: 'primary',
      updatedAt: '2026-03-22T12:00:00+08:00',
    },
    {
      id: 102,
      subjectId: 102,
      title: '迷宫饭',
      originalTitle: 'ダンジョン飯',
      cover: '',
      summary: '边冒险边做饭的地下城日常。',
      eps: 24,
      watchedEpisodes: 9,
      progressText: '9/24',
      score: 8.4,
      rank: 45,
      collectionType: SUBJECT_COLLECTION_TYPES.DOING,
      collectionTypeLabel: '在看',
      collectionTypeTone: 'primary',
      updatedAt: '2026-03-22T12:00:00+08:00',
    },
    {
      id: 103,
      subjectId: 103,
      title: '轻音少女',
      originalTitle: 'けいおん!',
      cover: '',
      summary: '放学后的音乐部时光。',
      eps: 14,
      watchedEpisodes: 14,
      progressText: '14/14',
      score: 8.2,
      rank: 60,
      collectionType: SUBJECT_COLLECTION_TYPES.DONE,
      collectionTypeLabel: '看过',
      collectionTypeTone: 'tertiary',
      updatedAt: '2026-03-22T12:00:00+08:00',
    },
  ],
  episodes: {
    101: Array.from({ length: 16 }, (_, index) => ({
      id: 10100 + index + 1,
      title: `第 ${index + 1} 话`,
      originalTitle: `Episode ${index + 1}`,
      sort: index + 1,
      type: 0,
      airdate: '',
      watched: index + 1 <= 14,
      collectionType: index + 1 <= 14 ? 2 : 0,
      isMainStory: true,
    })),
    102: Array.from({ length: 12 }, (_, index) => ({
      id: 10200 + index + 1,
      title: `第 ${index + 1} 话`,
      originalTitle: `Episode ${index + 1}`,
      sort: index + 1,
      type: 0,
      airdate: '',
      watched: index + 1 <= 9,
      collectionType: index + 1 <= 9 ? 2 : 0,
      isMainStory: true,
    })),
    103: Array.from({ length: 14 }, (_, index) => ({
      id: 10300 + index + 1,
      title: `第 ${index + 1} 话`,
      originalTitle: `Episode ${index + 1}`,
      sort: index + 1,
      type: 0,
      airdate: '',
      watched: true,
      collectionType: 2,
      isMainStory: true,
    })),
  },
  searchResults: [
    {
      id: 201,
      title: '别当欧尼酱了！',
      originalTitle: 'お兄ちゃんはおしまい！',
      cover: '',
      score: 7.4,
      rank: 320,
      eps: 12,
      airDate: '2023-01-05',
      summary: '一场生活节奏被突然改写的喜剧。',
    },
    {
      id: 202,
      title: '异世界舅舅',
      originalTitle: '異世界おじさん',
      cover: '',
      score: 7.7,
      rank: 190,
      eps: 13,
      airDate: '2022-07-06',
      summary: '醒来后还在讲异世界经历的舅舅。',
    },
  ],
};

const toneMap = {
  [SUBJECT_COLLECTION_TYPES.WISH]: { label: '想看', tone: 'secondary' },
  [SUBJECT_COLLECTION_TYPES.DONE]: { label: '看过', tone: 'tertiary' },
  [SUBJECT_COLLECTION_TYPES.DOING]: { label: '在看', tone: 'primary' },
  [SUBJECT_COLLECTION_TYPES.ON_HOLD]: { label: '搁置', tone: 'warning' },
  [SUBJECT_COLLECTION_TYPES.DROPPED]: { label: '抛弃', tone: 'error' },
};

const syncCollectionProgress = (subjectId) => {
  const episodes = collectionState.episodes[subjectId] || [];
  const watchedEpisodes = episodes.filter((item) => item.watched).length;
  const collection = collectionState.collections.find((item) => item.subjectId === subjectId);

  if (!collection) {
    return;
  }

  collection.watchedEpisodes = watchedEpisodes;
  collection.progressText = collection.eps > 0 ? `${watchedEpisodes}/${collection.eps}` : String(watchedEpisodes);
};

export const previewApi = {
  async authStatus() {
    return {
      authenticated: Boolean(collectionState.token),
      hasToken: Boolean(collectionState.token),
      viewer: collectionState.token ? collectionState.viewer : null,
      preferences: {
        defaultFilter: collectionState.filterType,
      },
    };
  },
  async authVerify({ token }) {
    if (!String(token || '').trim()) {
      throw new Error('请输入 Access Token。');
    }

    collectionState.token = String(token).trim();

    return {
      authenticated: true,
      viewer: collectionState.viewer,
    };
  },
  async authLogout() {
    collectionState.token = '';
    return { success: true };
  },
  async dashboardLoad({ filterType }) {
    collectionState.filterType = Number(filterType || collectionState.filterType);

    return {
      viewer: collectionState.viewer,
      collections: collectionState.collections.filter(
        (item) => Number(item.collectionType) === Number(collectionState.filterType),
      ),
      total: collectionState.collections.length,
      filterType: collectionState.filterType,
    };
  },
  async searchSubjects({ keyword }) {
    const normalized = String(keyword || '').trim();

    return {
      keyword: normalized,
      items: normalized
        ? collectionState.searchResults.filter((item) => (
          item.title.includes(normalized) || item.originalTitle.toLowerCase().includes(normalized.toLowerCase())
        ))
        : [],
    };
  },
  async collectSubject({ subjectId, type }) {
    const searchItem = collectionState.searchResults.find((item) => item.id === Number(subjectId));

    if (searchItem && !collectionState.collections.some((item) => item.subjectId === Number(subjectId))) {
      const tone = toneMap[type] || toneMap[SUBJECT_COLLECTION_TYPES.DOING];
      collectionState.collections.unshift({
        id: searchItem.id,
        subjectId: searchItem.id,
        title: searchItem.title,
        originalTitle: searchItem.originalTitle,
        cover: searchItem.cover,
        summary: searchItem.summary,
        eps: searchItem.eps,
        watchedEpisodes: 0,
        progressText: `0/${searchItem.eps}`,
        score: searchItem.score,
        rank: searchItem.rank,
        collectionType: Number(type),
        collectionTypeLabel: tone.label,
        collectionTypeTone: tone.tone,
        updatedAt: new Date().toISOString(),
      });
      collectionState.episodes[subjectId] = Array.from({ length: searchItem.eps }, (_, index) => ({
        id: subjectId * 100 + index + 1,
        title: `第 ${index + 1} 话`,
        originalTitle: `Episode ${index + 1}`,
        sort: index + 1,
        type: 0,
        airdate: '',
        watched: false,
        collectionType: 0,
        isMainStory: true,
      }));
    }

    const collection = collectionState.collections.find((item) => item.subjectId === Number(subjectId));
    if (collection) {
      const tone = toneMap[type] || toneMap[SUBJECT_COLLECTION_TYPES.DOING];
      collection.collectionType = Number(type);
      collection.collectionTypeLabel = tone.label;
      collection.collectionTypeTone = tone.tone;
    }

    return { success: true };
  },
  async getSubjectEpisodes({ subjectId }) {
    return {
      items: collectionState.episodes[subjectId] || [],
    };
  },
  async updateEpisodeState({ episodeId }) {
    Object.values(collectionState.episodes).forEach((items) => {
      const target = items.find((item) => item.id === Number(episodeId));
      if (target) {
        target.watched = true;
        target.collectionType = 2;
      }
    });

    Object.keys(collectionState.episodes).forEach((subjectId) => {
      syncCollectionProgress(Number(subjectId));
    });

    return { success: true };
  },
  async updateProgressToEpisode({ subjectId, episodeId }) {
    const items = collectionState.episodes[subjectId] || [];
    const target = items.find((item) => item.id === Number(episodeId));

    if (!target) {
      throw new Error('没有可更新的分集进度。');
    }

    items.forEach((item) => {
      if (item.sort <= target.sort) {
        item.watched = true;
        item.collectionType = 2;
      }
    });

    syncCollectionProgress(Number(subjectId));

    return { success: true };
  },
};
