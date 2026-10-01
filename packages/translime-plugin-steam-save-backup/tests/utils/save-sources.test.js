import { describe, expect, it } from 'vitest';
import {
  createCustomDirectorySource,
  createSteamCloudSource,
  SAVE_SOURCE_TYPES,
  saveSourcesToSavePaths,
} from '../../src/utils/save-sources';

describe('saveSourcesToSavePaths', () => {
  it('默认同时支持 steam-cloud 与 custom-directory 来源，手动添加的目录参与备份', () => {
    const sources = [
      createSteamCloudSource({
        absolutePath: 'C:/Games/userdata/123/remote',
        files: ['remotecache.vdf'],
        root: 0,
      }),
      createCustomDirectorySource({
        id: 'custom-directory:123:C:/Games/MySave',
        absolutePath: 'C:/Games/MySave',
        files: ['slot1.sav'],
      }),
    ];

    const paths = saveSourcesToSavePaths(sources);

    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.sourceType)).toEqual([
      SAVE_SOURCE_TYPES.STEAM_CLOUD,
      SAVE_SOURCE_TYPES.CUSTOM_DIRECTORY,
    ]);
    expect(paths[1].files).toEqual(['slot1.sav']);
  });

  it('跳过未启用、缺路径或缺文件清单的来源', () => {
    const sources = [
      createSteamCloudSource({ absolutePath: '', files: ['a.sav'] }),
      createCustomDirectorySource({ absolutePath: 'C:/Empty', files: [] }),
      createCustomDirectorySource({ absolutePath: 'C:/Off', files: ['x.sav'], enabled: false }),
      createCustomDirectorySource({ absolutePath: 'C:/Ok', files: ['x.sav'] }),
    ];

    const paths = saveSourcesToSavePaths(sources);

    expect(paths).toHaveLength(1);
    expect(paths[0].absolutePath).toBe('C:/Ok');
  });
});

describe('createCustomDirectorySource', () => {
  it('自定义目录来源默认标记 label 与 custom 元数据，路径缺失时禁用', () => {
    const source = createCustomDirectorySource({
      absolutePath: 'C:/Games/MySave',
      files: ['slot1.sav'],
    });

    expect(source.type).toBe(SAVE_SOURCE_TYPES.CUSTOM_DIRECTORY);
    expect(source.label).toBe('自定义目录');
    expect(source.enabled).toBe(true);
    expect(source.metadata.custom).toBe(true);

    const missing = createCustomDirectorySource({ absolutePath: '' });
    expect(missing.enabled).toBe(false);
  });
});
