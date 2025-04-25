import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import pkg from '@pkg/../package.json';
import path from 'node:path';
import appConfigStore from './appConfigStore';

const filename = fileURLToPath(import.meta.url);
const dir = path.dirname(filename);

const useMainStore = () => {
  const APP_VERSION = pkg.version;
  const ROOT = path.join(dir, '..');
  const APPDATA_PATH = app.getPath('userData');
  const TEMP_DIR = app.getPath('temp');
  const config = appConfigStore;
  const mainStore = {
    launchWin: null,
    win: null,
    childWins: {},
    ipc: null,
    mainProcessLock: null,
    tray: null,
    pluginLoader: null,
  };

  const set = (key, value) => {
    mainStore[key] = value;
  };
  const get = (key, defaultValue) => (typeof mainStore[key] === 'undefined' ? defaultValue : mainStore[key]);
  const getWin = () => get('win');
  const getChildWin = (name) => (name ? get('childWins')[name] : get('childWins'));
  const setChildWin = (name, win) => {
    mainStore.childWins[name] = win;
  };
  const removeChildWin = (name) => {
    delete mainStore.childWins[name];
  };

  return {
    APP_VERSION,
    ROOT,
    APPDATA_PATH,
    TEMP_DIR,
    config,
    ipc: () => get('ipc'),
    set,
    get,
    getWin,
    getChildWin,
    setChildWin,
    removeChildWin,
  };
};

const mainStore = useMainStore();
if (!global.mainStore) {
  global.mainStore = mainStore;
  global.config = mainStore.config;
  global.ROOT = mainStore.ROOT;
  global.APPDATA_PATH = mainStore.APPDATA_PATH;
  global.TEMP_DIR = mainStore.TEMP_DIR;
}

export default mainStore;
