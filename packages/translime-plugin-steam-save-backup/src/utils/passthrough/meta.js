import { hashGameKey } from '../custom-dirs';

export const PASSTHROUGH_ROOT = 'passthrough';
export const META_DIR = '.translime';
export const META_NAME = 'meta.json';

/**
 * 直通条目 ID：由用户填写的存档名生成，跨设备一致。
 * 同一存档在各台机器上的本地路径不同，不能作为多端对齐的键。
 */
export const buildEntryId = (name) => hashGameKey(name);

export const joinRemotePassthroughRoot = (target) => `${String(target).replace(/[\\/]+$/, '')}/${PASSTHROUGH_ROOT}`;

export const joinRemoteEntry = (target, entryId) => `${joinRemotePassthroughRoot(target)}/${entryId}`;

export const joinRemoteMeta = (target, entryId) => `${joinRemoteEntry(target, entryId)}/${META_DIR}/${META_NAME}`;

/**
 * 远端条目元数据（.translime/meta.json）：轻量描述 + 删除墓碑标记。
 * 目录名与文件名刻意避开备份引擎按两级通配拉取 info.json 的规则，
 * 备份对账看不见直通数据，实现两块数据隔离。
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

/** 解析并规范化远端 meta；缺 entryId 或结构不合法时返回 null（视为远端尚无此条目） */
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
