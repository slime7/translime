const useAppManager = () => {
  const state = {
    win: null,
    launchWin: null,
    childWins: {},
    ipc: null,
    pluginLoader: null,
    tray: null,
    mainProcessLock: null,
    isQuitting: false,
  };

  const setWin = (win) => {
    state.win = win;
  };

  const getWin = () => state.win;

  const setLaunchWin = (win) => {
    state.launchWin = win;
  };

  const getLaunchWin = () => state.launchWin;

  const setChildWin = (name, win) => {
    state.childWins[name] = win;
  };

  const getChildWin = (name) => (name ? state.childWins[name] : state.childWins);

  const removeChildWin = (name) => {
    delete state.childWins[name];
  };

  const setIpc = (ipc) => {
    state.ipc = ipc;
  };

  const getIpc = () => state.ipc;

  const setPluginLoader = (loader) => {
    state.pluginLoader = loader;
  };

  const getPluginLoader = () => state.pluginLoader;

  const setTray = (tray) => {
    state.tray = tray;
  };

  const getTray = () => state.tray;

  const setMainProcessLock = (lock) => {
    state.mainProcessLock = lock;
  };

  const getMainProcessLock = () => state.mainProcessLock;

  return {
    setWin,
    getWin,
    setLaunchWin,
    getLaunchWin,
    setChildWin,
    getChildWin,
    removeChildWin,
    setIpc,
    getIpc,
    setPluginLoader,
    getPluginLoader,
    setTray,
    getTray,
    setMainProcessLock,
    getMainProcessLock,
    state, // 暴露 state 以便某些特殊情况访问
  };
};

const appManager = useAppManager();

if (!global.appManager) {
  global.appManager = appManager;
}

export default appManager;
