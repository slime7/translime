export const SAVE_SOURCE_TYPES = {
  STEAM_CLOUD: 'steam-cloud',
  CUSTOM_DIRECTORY: 'custom-directory',
};

const normalizeFiles = (files) => {
  if (!Array.isArray(files)) {
    return [];
  }

  return files.filter((file) => typeof file === 'string' && file.length > 0);
};

const createSourceId = (type, index, absolutePath, relativePath) => [
  type,
  index,
  absolutePath || '',
  relativePath || '',
].join(':');

export const normalizeSaveSource = (source, index = 0) => {
  const type = source?.type || SAVE_SOURCE_TYPES.STEAM_CLOUD;
  const absolutePath = source?.absolutePath || '';
  const relativePath = source?.relativePath || '.';
  const files = normalizeFiles(source?.files);

  return {
    id: source?.id || createSourceId(type, index, absolutePath, relativePath),
    type,
    label: source?.label || 'Steam Cloud',
    absolutePath,
    relativePath,
    files,
    enabled: source?.enabled !== false,
    metadata: source?.metadata || {},
  };
};

export const createSteamCloudSource = (savePath, index = 0) => normalizeSaveSource({
  id: createSourceId(
    SAVE_SOURCE_TYPES.STEAM_CLOUD,
    index,
    savePath?.absolutePath,
    savePath?.relativePath,
  ),
  type: SAVE_SOURCE_TYPES.STEAM_CLOUD,
  label: 'Steam Cloud',
  absolutePath: savePath?.absolutePath || '',
  relativePath: savePath?.relativePath || '.',
  files: savePath?.files || [],
  enabled: Boolean(savePath?.absolutePath),
  metadata: {
    root: savePath?.root,
    savePathIndex: index,
  },
}, index);

export const createCustomDirectorySource = (source = {}, index = 0) => normalizeSaveSource({
  ...source,
  type: SAVE_SOURCE_TYPES.CUSTOM_DIRECTORY,
  label: source.label || 'Custom Directory',
  metadata: {
    ...(source.metadata || {}),
    reserved: true,
  },
}, index);

export const steamSavePathsToSaveSources = (savePaths = []) => {
  if (!Array.isArray(savePaths)) {
    return [];
  }

  return savePaths.map((savePath, index) => createSteamCloudSource(savePath, index));
};

export const saveSourcesToSavePaths = (
  saveSources = [],
  supportedTypes = [SAVE_SOURCE_TYPES.STEAM_CLOUD],
) => {
  if (!Array.isArray(saveSources)) {
    return [];
  }

  return saveSources
    .map((source, index) => normalizeSaveSource(source, index))
    .filter((source) => supportedTypes.includes(source.type))
    .filter((source) => source.enabled && source.absolutePath && source.files.length > 0)
    .map((source, index) => ({
      root: source.metadata.root,
      relativePath: source.relativePath,
      absolutePath: source.absolutePath,
      files: source.files,
      sourceId: source.id,
      sourceType: source.type,
      sourceLabel: source.label,
      sourceIndex: index,
    }));
};

export const getBackupSourcesMetadata = (saveSources = [], backedUpPaths = []) => {
  const sourceMap = new Map(
    saveSources
      .map((source, index) => normalizeSaveSource(source, index))
      .map((source) => [source.id, source]),
  );

  return backedUpPaths
    .map((savePath) => sourceMap.get(savePath.sourceId))
    .filter(Boolean)
    .map((source) => ({
      id: source.id,
      type: source.type,
      label: source.label,
      absolutePath: source.absolutePath,
      relativePath: source.relativePath,
      files: source.files,
      enabled: source.enabled,
      metadata: source.metadata,
    }));
};
