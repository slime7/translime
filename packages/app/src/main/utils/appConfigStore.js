import Store from 'electron-store';

const appConfigStore = new Store({
  name: 'config',
  serialize: (value) => JSON.stringify(value, null, '  '),
  clearInvalidConfig: true,
});

export default appConfigStore;
