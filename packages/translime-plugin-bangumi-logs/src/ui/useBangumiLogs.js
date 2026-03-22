import {
  computed,
  reactive,
  ref,
} from 'vue';
import {
  isPreviewMode,
  openLink,
  useIpc,
} from 'translime-sdk';
import {
  BANGUMI_ACCESS_TOKEN_URL,
  EPISODE_COLLECTION_TYPES,
  EPISODE_WATCHED_TYPE,
  SUBJECT_COLLECTION_TYPES,
  SUBJECT_FILTER_OPTIONS,
} from '../shared/constants.js';
import { previewApi } from './previewData.js';

const createDefaultState = () => ({
  ready: false,
  authenticating: false,
  refreshing: false,
  searching: false,
  errorMessage: '',
  viewer: null,
  tokenInput: '',
  authenticated: false,
  filterType: SUBJECT_COLLECTION_TYPES.DOING,
  collections: [],
  selectedSubjectId: 0,
  detailDialogOpen: false,
  episodeMap: {},
  searchKeyword: '',
  searchResults: [],
});

export const useBangumiLogs = () => {
  const ipc = useIpc();
  const previewMode = isPreviewMode();
  const invoke = (channel, payload) => {
    if (!previewMode) {
      return ipc.invoke(channel, payload);
    }

    switch (channel) {
    case 'auth-status@translime-plugin-bangumi-logs':
      return previewApi.authStatus(payload);
    case 'auth-verify@translime-plugin-bangumi-logs':
      return previewApi.authVerify(payload);
    case 'auth-logout@translime-plugin-bangumi-logs':
      return previewApi.authLogout(payload);
    case 'dashboard-load@translime-plugin-bangumi-logs':
      return previewApi.dashboardLoad(payload);
    case 'search-subjects@translime-plugin-bangumi-logs':
      return previewApi.searchSubjects(payload);
    case 'collect-subject@translime-plugin-bangumi-logs':
      return previewApi.collectSubject(payload);
    case 'get-subject-episodes@translime-plugin-bangumi-logs':
      return previewApi.getSubjectEpisodes(payload);
    case 'update-episode-state@translime-plugin-bangumi-logs':
      return previewApi.updateEpisodeState(payload);
    case 'update-progress-to-episode@translime-plugin-bangumi-logs':
      return previewApi.updateProgressToEpisode(payload);
    default:
      return Promise.resolve(null);
    }
  };
  const state = reactive(createDefaultState());
  const detailLoading = ref(false);
  const actionLoading = ref(false);

  const selectedCollection = computed(() => state.collections.find(
    (item) => Number(item.subjectId) === Number(state.selectedSubjectId),
  ) || null);

  const selectedEpisodes = computed(() => state.episodeMap[state.selectedSubjectId] || []);

  const setError = (message = '') => {
    state.errorMessage = message || '';
  };

  const syncStatus = async () => {
    setError('');
    const status = await invoke('auth-status@translime-plugin-bangumi-logs');

    state.ready = true;
    state.authenticated = Boolean(status?.authenticated);
    state.viewer = status?.viewer || null;
    state.filterType = Number(status?.preferences?.defaultFilter || SUBJECT_COLLECTION_TYPES.DOING);
    state.errorMessage = status?.errorMessage || '';
  };

  const loadDashboard = async (filterType = state.filterType) => {
    state.refreshing = true;
    setError('');

    try {
      const result = await invoke('dashboard-load@translime-plugin-bangumi-logs', {
        filterType,
      });

      state.authenticated = true;
      state.viewer = result.viewer;
      state.collections = result.collections || [];
      state.filterType = Number(result.filterType || filterType);

      if (!state.collections.some((item) => Number(item.subjectId) === Number(state.selectedSubjectId))) {
        state.selectedSubjectId = 0;
        state.detailDialogOpen = false;
      }
    } catch (error) {
      setError(error.message);
    } finally {
      state.refreshing = false;
    }
  };

  const verifyToken = async () => {
    state.authenticating = true;
    setError('');

    try {
      const result = await invoke('auth-verify@translime-plugin-bangumi-logs', {
        token: state.tokenInput,
      });

      state.authenticated = true;
      state.viewer = result.viewer;
      await loadDashboard(state.filterType);
    } catch (error) {
      setError(error.message);
    } finally {
      state.authenticating = false;
    }
  };

  const logout = async () => {
    await invoke('auth-logout@translime-plugin-bangumi-logs');
    Object.assign(state, createDefaultState(), { ready: true });
  };

  const loadEpisodes = async (subjectId) => {
    if (!subjectId) {
      return;
    }

    detailLoading.value = true;
    state.selectedSubjectId = subjectId;

    try {
      const result = await invoke('get-subject-episodes@translime-plugin-bangumi-logs', {
        subjectId,
      });
      state.episodeMap[subjectId] = result.items || [];
    } finally {
      detailLoading.value = false;
    }
  };

  const openCollectionDetail = async (subjectId) => {
    state.selectedSubjectId = subjectId;
    state.detailDialogOpen = true;
    await loadEpisodes(subjectId);
  };

  const closeCollectionDetail = () => {
    state.detailDialogOpen = false;
  };

  const refreshSelectedSubject = async () => {
    if (!state.selectedSubjectId) {
      return;
    }

    await loadDashboard(state.filterType);
    await loadEpisodes(state.selectedSubjectId);
  };

  const searchSubjects = async () => {
    const keyword = state.searchKeyword.trim();
    if (!keyword) {
      state.searchResults = [];
      return;
    }

    state.searching = true;

    try {
      const result = await invoke('search-subjects@translime-plugin-bangumi-logs', {
        keyword,
      });
      state.searchResults = result.items || [];
    } finally {
      state.searching = false;
    }
  };

  const collectSubject = async (subjectId, type = SUBJECT_COLLECTION_TYPES.DOING) => {
    actionLoading.value = true;

    try {
      await invoke('collect-subject@translime-plugin-bangumi-logs', {
        subjectId,
        type,
      });
      await loadDashboard(state.filterType);
      state.searchKeyword = '';
      state.searchResults = [];
    } catch (error) {
      setError(error.message);
    } finally {
      actionLoading.value = false;
    }
  };

  const updateCollectionType = async (subjectId, type) => {
    await collectSubject(subjectId, type);
  };

  const markEpisodeWatched = async (episodeId) => {
    actionLoading.value = true;

    try {
      await invoke('update-episode-state@translime-plugin-bangumi-logs', {
        episodeId,
        type: EPISODE_WATCHED_TYPE,
      });
      await refreshSelectedSubject();
    } catch (error) {
      setError(error.message);
    } finally {
      actionLoading.value = false;
    }
  };

  const markEpisodeState = async (episodeId, type) => {
    actionLoading.value = true;

    try {
      await invoke('update-episode-state@translime-plugin-bangumi-logs', {
        episodeId,
        type,
      });
      await refreshSelectedSubject();
    } catch (error) {
      setError(error.message);
    } finally {
      actionLoading.value = false;
    }
  };

  const markProgressToEpisode = async (subjectId, episodeId) => {
    actionLoading.value = true;

    try {
      await invoke('update-progress-to-episode@translime-plugin-bangumi-logs', {
        subjectId,
        episodeId,
      });
      await refreshSelectedSubject();
    } catch (error) {
      setError(error.message);
    } finally {
      actionLoading.value = false;
    }
  };

  const openTokenPage = () => openLink({ url: BANGUMI_ACCESS_TOKEN_URL });

  return {
    state,
    detailLoading,
    actionLoading,
    selectedCollection,
    selectedEpisodes,
    filterOptions: SUBJECT_FILTER_OPTIONS,
    episodeCollectionTypes: EPISODE_COLLECTION_TYPES,
    syncStatus,
    verifyToken,
    logout,
    loadDashboard,
    loadEpisodes,
    openCollectionDetail,
    closeCollectionDetail,
    searchSubjects,
    collectSubject,
    updateCollectionType,
    markEpisodeWatched,
    markEpisodeState,
    markProgressToEpisode,
    openTokenPage,
  };
};
