import { hashGameKey } from '../custom-dirs';

export const PASSTHROUGH_ROOT = 'passthrough';
export const META_NAME = 'meta.json';

/**
 * 根据存档名称生成跨设备一致的条目 ID。
 */
export const buildEntryId = (name) => hashGameKey(name);

export const joinRemotePassthroughRoot = (target) => `${String(target).replace(/[\\/]+$/, '')}/${PASSTHROUGH_ROOT}`;

export const joinRemoteEntry = (target, entryId) => `${joinRemotePassthroughRoot(target)}/${entryId}`;

export const joinRemoteMeta = (target, entryId) => `${joinRemoteEntry(target, entryId)}/${META_NAME}`;

/**
 * 构造远端条目元数据，包含基本信息与墓碑标记。
 */
export const createMeta = ({
  entryId, name, machineId, at,
}) => ({
  schemaVersion: 1,
  entryId,
  name,
  updatedAt: at,
  updatedBy: machineId || null,
  deleted: false,
});

export const markMetaDeleted = (meta, { machineId, at }) => ({
  ...meta,
  deleted: true,
  deletedAt: at,
  deletedBy: machineId || null,
});

const stringOr = (value) => (typeof value === 'string' && value ? value : null);

/** 解析并规范化远端 meta，无效时返回 null */
export const parseMeta = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  if (typeof raw.entryId !== 'string' || !raw.entryId) {
    return null;
  }
  return {
    schemaVersion: 1,
    entryId: raw.entryId,
    name: typeof raw.name === 'string' ? raw.name : '',
    updatedAt: stringOr(raw.updatedAt),
    updatedBy: stringOr(raw.updatedBy),
    deleted: Boolean(raw.deleted),
    deletedAt: stringOr(raw.deletedAt),
    deletedBy: stringOr(raw.deletedBy),
  };
};
