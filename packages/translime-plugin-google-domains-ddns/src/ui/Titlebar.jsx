import './titlebar.css';

const ipc = window.electron.useIpc();
const windowName = 'plugin-window-translime-plugin-google-domains-ddns';

const devtools = () => {
  ipc.send('devtools', windowName);
};
const closeWindow = () => {
  window.ts.windowControl.close(windowName);
};

export default function Titlebar() {
  return (
    <div className="titlebar flex">
      <div className="flex-grow" />

      <div className="window-control-block">
        {
          process.env.NODE_ENV !== 'development'
            ? null
            : <div onClick={devtools} className="control-btn devtool">🔧</div>
        }
        <div onClick={closeWindow} className="control-btn close">✖️</div>
      </div>
    </div>
  );
}
