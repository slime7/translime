import { useEffect, useState } from 'preact/hooks';
import Titlebar from './Titlebar.jsx';

const ipc = window.electron.useIpc();

const start = () => {
  ipc.send('start@translime-plugin-google-domains-ddns', 4);
};
const stop = () => {
  ipc.send('stop@translime-plugin-google-domains-ddns', 4);
};
const openLogDir = () => {
  ipc.send('open-dir', { dirPath: `${window.electron.APPDATA_PATH}/google-domains-ddns` });
};

export default function Ui() {
  const [logs, setLogs] = useState([]);
  const onLog = () => {
    ipc.on('logs', (l) => {
      setLogs(l);
    });
  };

  const [isRunning, setIsRunning] = useState(false);
  const checkIsRunning = async () => {
    const result = await ipc.invoke('isRunning@translime-plugin-google-domains-ddns');
    setIsRunning(result);
  };

  useEffect(() => {
    onLog();
    checkIsRunning();
  }, []);

  const handleStart = () => {
    start();
    setIsRunning(true);
  };
  const handleStop = () => {
    stop();
    setIsRunning(false);
  };

  return (
    <>
      <Titlebar />

      <main className="main">
        <div>
          {
            !isRunning
              ? <button onClick={handleStart}>定时执行</button>
              : <button onClick={handleStop}>停止</button>
          }
        </div>

        <div className="flex items-center mt-2">
          <div>日志</div>
          <button className="ml-2" onClick={openLogDir}>所有日志</button>
        </div>
        <div className="text-sm w-full max-h-24 overflow-x-auto">{logs.at(-1)}</div>
        <div className="text-sm w-full max-h-24 overflow-x-auto">{logs.at(-2)}</div>
        <div className="text-sm w-full max-h-24 overflow-x-auto">{logs.at(-3)}</div>
      </main>
    </>
  );
}
