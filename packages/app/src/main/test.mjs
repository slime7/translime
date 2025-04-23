import electron from 'electron';

export default () => {
  alert(electron.app.isPackaged());
};
