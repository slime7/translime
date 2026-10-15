import net from 'node:net';

const probePort = (host, port, timeoutMs) => new Promise((resolve) => {
  const socket = new net.Socket();
  let settled = false;
  const finish = (open) => {
    if (settled) {
      return;
    }
    settled = true;
    socket.destroy();
    resolve(open);
  };
  socket.setTimeout(timeoutMs);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
  socket.connect(port, host);
});

/**
 * 并发探测目标主机的一组 TCP 端口，返回开放端口（升序）。
 * 手机对关闭端口会立即回 RST，局域网内整段扫描可在十余秒内完成
 */
export default async function scanOpenPorts({
  host,
  ports,
  timeoutMs = 250,
  concurrency = 512,
  probe = probePort,
}) {
  const open = [];
  let cursor = 0;
  const worker = async () => {
    if (cursor >= ports.length) {
      return;
    }
    const port = ports[cursor];
    cursor += 1;
    const isOpen = await probe(host, port, timeoutMs).catch(() => false);
    if (isOpen) {
      open.push(port);
    }
    await worker();
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ports.length) }, () => worker()));
  return open.sort((a, b) => a - b);
}
