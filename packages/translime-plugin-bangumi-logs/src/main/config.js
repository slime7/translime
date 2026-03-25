import { usePluginConfig } from 'translime-sdk';
import { PLUGIN_ID, SUBJECT_COLLECTION_TYPES } from '../shared/constants';

const pluginConfig = usePluginConfig(PLUGIN_ID);

export const getAccessToken = () => pluginConfig.get('accessToken', '').trim();

export const setAccessToken = (token) => {
  pluginConfig.set('accessToken', (token || '').trim());
};

export const clearAccessToken = () => {
  pluginConfig.set('accessToken', '');
};

export const getUiPreferences = () => pluginConfig.get('uiPreferences', {
  defaultFilter: SUBJECT_COLLECTION_TYPES.DOING,
  pageSize: 24,
});

export const setUiPreferences = (preferences = {}) => {
  pluginConfig.set('uiPreferences', {
    ...getUiPreferences(),
    ...preferences,
  });
};
