export const PLUGIN_ID = 'translime-plugin-bangumi-logs';
export const BANGUMI_API_BASE_URL = 'https://api.bgm.tv';
export const BANGUMI_ACCESS_TOKEN_URL = 'https://next.bgm.tv/demo/access-token/create';
export const BANGUMI_USER_AGENT = 'Translime Bangumi Logs/1.0.0 (https://github.com/slime7/translime)';
export const ANIME_SUBJECT_TYPE = 2;
export const MAIN_STORY_EPISODE_TYPE = 0;
export const EPISODE_WATCHED_TYPE = 2;

export const EPISODE_COLLECTION_TYPES = {
  WISH: 1,
  WATCHED: 2,
  DROPPED: 3,
};

export const EPISODE_COLLECTION_LABELS = {
  0: '未看',
  1: '想看',
  2: '已看',
  3: '抛弃',
};

export const EPISODE_COLLECTION_TONES = {
  0: 'surface-variant',
  1: 'secondary',
  2: 'primary',
  3: 'error',
};
export const SUBJECT_COLLECTION_TYPES = {
  WISH: 1,
  DONE: 2,
  DOING: 3,
  ON_HOLD: 4,
  DROPPED: 5,
};

export const SUBJECT_FILTER_OPTIONS = [
  { title: '在看', value: SUBJECT_COLLECTION_TYPES.DOING },
  { title: '想看', value: SUBJECT_COLLECTION_TYPES.WISH },
  { title: '看过', value: SUBJECT_COLLECTION_TYPES.DONE },
  { title: '搁置', value: SUBJECT_COLLECTION_TYPES.ON_HOLD },
  { title: '抛弃', value: SUBJECT_COLLECTION_TYPES.DROPPED },
];

export const SUBJECT_COLLECTION_LABELS = {
  [SUBJECT_COLLECTION_TYPES.WISH]: '想看',
  [SUBJECT_COLLECTION_TYPES.DONE]: '看过',
  [SUBJECT_COLLECTION_TYPES.DOING]: '在看',
  [SUBJECT_COLLECTION_TYPES.ON_HOLD]: '搁置',
  [SUBJECT_COLLECTION_TYPES.DROPPED]: '抛弃',
};

export const SUBJECT_COLLECTION_TONES = {
  [SUBJECT_COLLECTION_TYPES.WISH]: 'secondary',
  [SUBJECT_COLLECTION_TYPES.DONE]: 'tertiary',
  [SUBJECT_COLLECTION_TYPES.DOING]: 'primary',
  [SUBJECT_COLLECTION_TYPES.ON_HOLD]: 'warning',
  [SUBJECT_COLLECTION_TYPES.DROPPED]: 'error',
};
