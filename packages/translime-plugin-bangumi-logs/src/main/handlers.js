import {
  clearAccessToken,
  getAccessToken,
  getUiPreferences,
  setAccessToken,
  setUiPreferences,
} from './config.js';
import { createBangumiApi } from './bangumiApi.js';
import { mapBangumiErrorMessage } from '../shared/errors.js';
import {
  buildMarkProgressPayload,
  filterAnimeSearchResults,
  mapCollectionToListItem,
  mapEpisodeCollections,
  mapViewer,
} from '../shared/transformers.js';

const requireToken = () => {
  const token = getAccessToken();

  if (!token) {
    throw new Error('请先填写 Access Token。');
  }

  return token;
};

const getApi = () => createBangumiApi(requireToken());

export const createHandlers = () => ([
  {
    type: 'auth-status',
    handler: () => async () => {
      const token = getAccessToken();

      if (!token) {
        return {
          authenticated: false,
          hasToken: false,
          viewer: null,
          preferences: getUiPreferences(),
        };
      }

      try {
        const viewer = await createBangumiApi(token).getMe();

        return {
          authenticated: true,
          hasToken: true,
          viewer: mapViewer(viewer),
          preferences: getUiPreferences(),
        };
      } catch (error) {
        return {
          authenticated: false,
          hasToken: true,
          viewer: null,
          preferences: getUiPreferences(),
          errorMessage: mapBangumiErrorMessage(error),
        };
      }
    },
  },
  {
    type: 'auth-verify',
    handler: () => async (payload = {}) => {
      const token = String(payload?.token || '').trim();

      if (!token) {
        throw new Error('请输入 Access Token。');
      }

      const api = createBangumiApi(token);
      const viewer = await api.getMe();

      setAccessToken(token);

      return {
        authenticated: true,
        viewer: mapViewer(viewer),
      };
    },
  },
  {
    type: 'auth-logout',
    handler: () => async () => {
      clearAccessToken();

      return {
        success: true,
      };
    },
  },
  {
    type: 'dashboard-load',
    handler: () => async (payload = {}) => {
      const api = getApi();
      const viewer = await api.getMe();
      const filterType = Number(payload?.filterType || getUiPreferences().defaultFilter);
      const limit = Number(payload?.limit || getUiPreferences().pageSize || 24);
      const page = await api.getCollections(viewer.username, filterType, limit, 0);

      setUiPreferences({
        defaultFilter: filterType,
        pageSize: limit,
      });

      return {
        viewer: mapViewer(viewer),
        collections: (page?.data || []).map(mapCollectionToListItem),
        total: Number(page?.total || 0),
        filterType,
      };
    },
  },
  {
    type: 'search-subjects',
    handler: () => async (payload = {}) => {
      const keyword = String(payload?.keyword || '').trim();

      if (!keyword) {
        return {
          keyword: '',
          items: [],
        };
      }

      const page = await getApi().searchSubjects(keyword, Number(payload?.limit || 10));

      return {
        keyword,
        items: filterAnimeSearchResults(page?.data || []),
      };
    },
  },
  {
    type: 'collect-subject',
    handler: () => async (payload = {}) => {
      await getApi().collectSubject(payload?.subjectId, payload?.type);

      return {
        success: true,
      };
    },
  },
  {
    type: 'get-subject-episodes',
    handler: () => async (payload = {}) => {
      const page = await getApi().getEpisodeCollections(payload?.subjectId, Number(payload?.limit || 100));

      return {
        items: mapEpisodeCollections(page?.data || []),
      };
    },
  },
  {
    type: 'update-episode-state',
    handler: () => async (payload = {}) => {
      await getApi().updateEpisodeState(payload?.episodeId, payload?.type);

      return {
        success: true,
      };
    },
  },
  {
    type: 'update-progress-to-episode',
    handler: () => async (payload = {}) => {
      const api = getApi();
      const episodePage = await api.getEpisodeCollections(payload?.subjectId, 1000);
      const items = mapEpisodeCollections(episodePage?.data || []);
      const episodeIds = buildMarkProgressPayload(items, payload?.episodeId);

      if (!episodeIds.length) {
        throw new Error('没有可更新的分集进度。');
      }

      await api.updateProgressToEpisode(payload?.subjectId, episodeIds);

      return {
        success: true,
        updatedEpisodeIds: episodeIds,
      };
    },
  },
]);
