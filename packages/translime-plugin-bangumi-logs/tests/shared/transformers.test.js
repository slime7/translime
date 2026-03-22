import {
  describe, expect, it,
} from 'vitest';
import {
  buildMarkProgressPayload,
  filterAnimeSearchResults,
  mapCollectionToListItem,
  mapEpisodeCollections,
  normalizeSummary,
} from '../../src/shared/transformers';

describe('transformers', () => {
  it('搜索结果应只保留动画条目', () => {
    const result = filterAnimeSearchResults([
      {
        id: 1, type: 2, name: '动画 A', name_cn: '动画 A', images: {},
      },
      {
        id: 2, type: 4, name: '游戏 B', name_cn: '游戏 B', images: {},
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('应将收藏映射为 UI 条目', () => {
    const item = mapCollectionToListItem({
      subject_id: 12,
      type: 3,
      ep_status: 5,
      subject: {
        id: 12,
        name: 'Original',
        name_cn: '中文标题',
        eps: 12,
        short_summary: ' 简介 \n\n 第二行 ',
        score: 7.8,
        rank: 123,
        images: {
          common: 'cover.jpg',
        },
      },
    });

    expect(item.title).toBe('中文标题');
    expect(item.summary).toBe('简介 第二行');
    expect(item.progressText).toBe('5/12');
    expect(item.collectionTypeLabel).toBe('在看');
  });

  it('应将分集列表按序号排序并映射观看状态', () => {
    const items = mapEpisodeCollections([
      {
        type: 1,
        episode: {
          id: 2, sort: 2, type: 0, name: 'ep2', name_cn: '第 2 话',
        },
      },
      {
        type: 2,
        episode: {
          id: 1, sort: 1, type: 0, name: 'ep1', name_cn: '第 1 话',
        },
      },
    ]);

    expect(items[0].id).toBe(1);
    expect(items[0].watched).toBe(true);
    expect(items[1].watched).toBe(false);
  });

  it('应生成“看到本集”的批量更新目标', () => {
    const ids = buildMarkProgressPayload([
      { id: 1, sort: 1, isMainStory: true },
      { id: 2, sort: 2, isMainStory: true },
      { id: 3, sort: 3, isMainStory: false },
      { id: 4, sort: 4, isMainStory: true },
    ], 2);

    expect(ids).toEqual([1, 2]);
  });

  it('应清理简介中的多余空白', () => {
    expect(normalizeSummary(' \n 简介第一句 \r\n   简介第二句\t')).toBe('简介第一句 简介第二句');
  });
});
