import { describe, expect, it } from 'vitest';
import createExcludeListStore, { parseExcludeList } from '../../src/utils/exclude-list';

const fakeConfig = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    get: (key, defaultValue) => (key in data ? data[key] : defaultValue),
    set: (key, value) => {
      data[key] = value;
    },
  };
};

const EXCLUDE_KEY = 'plugin.translime-plugin-steam-save-backup.settings.excludeList';

const storeOn = (settings) => {
  const config = fakeConfig(settings);
  return {
    config,
    store: createExcludeListStore(config, 'translime-plugin-steam-save-backup'),
  };
};

describe('parseExcludeList', () => {
  it('解析设置页保存的逗号分隔字符串，忽略空段与段内空格', () => {
    expect(parseExcludeList('730, 570,, ')).toEqual(['730', '570']);
  });

  it('支持数组格式存储（元素统一转为字符串）', () => {
    expect(parseExcludeList(['730', 570])).toEqual(['730', '570']);
  });

  it('缺失或非字符串/数组的值返回空列表', () => {
    expect(parseExcludeList(undefined)).toEqual([]);
    expect(parseExcludeList(null)).toEqual([]);
    expect(parseExcludeList(730)).toEqual([]);
  });
});

describe('createExcludeListStore', () => {
  it('get 读取逗号分隔字符串设置并解析', () => {
    const { store } = storeOn({ [EXCLUDE_KEY]: '730,570' });

    expect(store.get()).toEqual(['730', '570']);
  });

  it('save 以逗号分隔字符串写回', () => {
    const { config, store } = storeOn({});

    store.save(['730', '570']);

    expect(config.data[EXCLUDE_KEY]).toBe('730,570');
  });

  it('migrate 将数组改写为字符串并返回 true', () => {
    const { config, store } = storeOn({ [EXCLUDE_KEY]: ['730', '570'] });

    expect(store.migrate()).toBe(true);
    expect(config.data[EXCLUDE_KEY]).toBe('730,570');
  });

  it('已是字符串或缺省时 migrate 不改写并返回 false', () => {
    const stringCase = storeOn({ [EXCLUDE_KEY]: '730' });
    const emptyCase = storeOn({});

    expect(stringCase.store.migrate()).toBe(false);
    expect(stringCase.config.data[EXCLUDE_KEY]).toBe('730');
    expect(emptyCase.store.migrate()).toBe(false);
  });

  it('config 不可用时 get 返回空列表，save/migrate 不抛错', () => {
    const store = createExcludeListStore(null, 'translime-plugin-steam-save-backup');

    expect(store.get()).toEqual([]);
    expect(() => store.save(['730'])).not.toThrow();
    expect(store.migrate()).toBe(false);
  });
});
