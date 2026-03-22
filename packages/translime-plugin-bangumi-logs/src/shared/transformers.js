import {
  ANIME_SUBJECT_TYPE,
  EPISODE_WATCHED_TYPE,
  MAIN_STORY_EPISODE_TYPE,
  SUBJECT_COLLECTION_LABELS,
  SUBJECT_COLLECTION_TONES,
} from './constants.js';

export const isAnimeSubject = (subject) => Number(subject?.type) === ANIME_SUBJECT_TYPE;

export const normalizeSubjectTitle = (subject) => subject?.name_cn || subject?.name || '未命名条目';

export const normalizeSummary = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim();

export const getSubjectCover = (subject) => (
  subject?.images?.large
  || subject?.images?.common
  || subject?.images?.medium
  || subject?.images?.grid
  || subject?.images?.small
  || ''
);

export const getCollectionTypeLabel = (value) => SUBJECT_COLLECTION_LABELS[value] || '未分类';

export const getCollectionTone = (value) => SUBJECT_COLLECTION_TONES[value] || 'surface-variant';

export const filterAnimeSearchResults = (items = []) => items
  .filter(isAnimeSubject)
  .map((subject) => ({
    id: subject.id,
    title: normalizeSubjectTitle(subject),
    originalTitle: subject.name || '',
    cover: getSubjectCover(subject),
    score: subject.rating?.score || 0,
    rank: subject.rank || 0,
    eps: Number(subject.eps || 0),
    airDate: subject.date || '',
    summary: normalizeSummary(subject.short_summary || subject.summary || ''),
  }));

export const mapViewer = (viewer = {}) => ({
  id: viewer.id || viewer.user_id || 0,
  username: viewer.username || '',
  nickname: viewer.nickname || viewer.username || '',
  sign: viewer.sign || '',
  avatar: viewer.avatar?.large || viewer.avatar?.medium || viewer.avatar?.small || '',
});

export const mapCollectionToListItem = (collection = {}) => {
  const subject = collection.subject || {};
  const totalEpisodes = Number(subject.eps || 0);
  const watchedEpisodes = Number(collection.ep_status || 0);

  return {
    id: collection.subject_id || subject.id,
    subjectId: collection.subject_id || subject.id,
    title: normalizeSubjectTitle(subject),
    originalTitle: subject.name || '',
    cover: getSubjectCover(subject),
    summary: normalizeSummary(subject.short_summary || subject.summary || ''),
    eps: totalEpisodes,
    watchedEpisodes,
    progressText: totalEpisodes > 0 ? `${watchedEpisodes}/${totalEpisodes}` : `${watchedEpisodes}`,
    score: subject.score || 0,
    rank: subject.rank || 0,
    collectionType: collection.type || 0,
    collectionTypeLabel: getCollectionTypeLabel(collection.type),
    collectionTypeTone: getCollectionTone(collection.type),
    updatedAt: collection.updated_at || '',
  };
};

export const mapEpisodeCollection = (item = {}) => {
  const episode = item.episode || {};
  const sort = Number(episode.sort || 0);
  const ep = episode.ep != null ? Number(episode.ep) : null;

  return {
    id: episode.id,
    nameCn: episode.name_cn || '',
    name: episode.name || '',
    title: episode.name_cn || episode.name || `第 ${sort || '?'} 话`,
    originalTitle: episode.name || '',
    sort,
    ep,
    type: Number(episode.type || 0),
    airdate: episode.airdate || '',
    duration: episode.duration || '',
    durationSeconds: Number(episode.duration_seconds || 0),
    watched: Number(item.type) === EPISODE_WATCHED_TYPE,
    collectionType: Number(item.type || 0),
    isMainStory: Number(episode.type || 0) === MAIN_STORY_EPISODE_TYPE,
  };
};

export const mapEpisodeCollections = (items = []) => items
  .map(mapEpisodeCollection)
  .sort((left, right) => left.sort - right.sort || left.id - right.id);

export const buildCollectionPayload = (type) => ({
  type: Number(type),
});

export const buildEpisodeStatePayload = (episodeId, type = EPISODE_WATCHED_TYPE) => ({
  episodeId: Number(episodeId),
  type: Number(type),
});

export const buildMarkProgressPayload = (episodeCollections = [], targetEpisodeId) => {
  const targetEpisode = episodeCollections.find((item) => Number(item.id) === Number(targetEpisodeId));

  if (!targetEpisode) {
    return [];
  }

  return episodeCollections
    .filter((item) => item.isMainStory && item.sort <= targetEpisode.sort)
    .map((item) => item.id);
};
