import { ANIME_SUBJECT_TYPE, EPISODE_WATCHED_TYPE } from '../shared/constants.js';
import { requestBangumi } from './request.js';

export const createBangumiApi = (token) => {
  const request = (path, options = {}) => requestBangumi(path, {
    ...options,
    token,
  });

  return {
    async getMe() {
      return request('/v0/me');
    },
    async getCollections(username, type, limit = 24, offset = 0) {
      return request(`/v0/users/${username}/collections`, {
        query: {
          subject_type: ANIME_SUBJECT_TYPE,
          type,
          limit,
          offset,
        },
      });
    },
    async searchSubjects(keyword, limit = 10) {
      return request('/v0/search/subjects', {
        method: 'POST',
        query: {
          limit,
          offset: 0,
        },
        body: {
          keyword,
          sort: 'match',
          filter: {
            type: [ANIME_SUBJECT_TYPE],
          },
        },
      });
    },
    async collectSubject(subjectId, type) {
      return request(`/v0/users/-/collections/${subjectId}`, {
        method: 'POST',
        body: {
          type: Number(type),
        },
      });
    },
    async getEpisodeCollections(subjectId, limit = 100) {
      return request(`/v0/users/-/collections/${subjectId}/episodes`, {
        query: {
          limit,
          offset: 0,
        },
      });
    },
    async updateEpisodeState(episodeId, type = EPISODE_WATCHED_TYPE) {
      return request(`/v0/users/-/collections/-/episodes/${episodeId}`, {
        method: 'PUT',
        body: {
          type,
        },
      });
    },
    async updateProgressToEpisode(subjectId, episodeIds) {
      return request(`/v0/users/-/collections/${subjectId}/episodes`, {
        method: 'PATCH',
        body: {
          episode_id: episodeIds,
          type: EPISODE_WATCHED_TYPE,
        },
      });
    },
  };
};
