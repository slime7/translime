/**
 * 把 PNG 数据写入系统剪贴板。
 *
 * Electron 44 移除了 `clipboard.writeImage`，图像改为经 W3C 风格的
 * `clipboard.write([ClipboardItem])` 写入；宿主 0.8.3 仍基于 Electron 39，
 * 因此按当前运行时存在哪套接口选择写入方式。
 *
 * @param {Buffer} pngBuffer - PNG 编码后的图像数据。
 * @returns {Promise<void>}
 */
export default async function writePngToClipboard(pngBuffer) {
  const {
    clipboard, ClipboardItem, nativeImage,
  } = await import('electron');

  if (typeof clipboard.writeImage === 'function') {
    clipboard.writeImage(nativeImage.createFromBuffer(pngBuffer));
    return;
  }

  if (typeof ClipboardItem === 'function') {
    const png = new Blob([pngBuffer], { type: 'image/png' });
    await clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return;
  }

  throw new Error('当前 Electron 运行时没有可用的剪贴板图像写入接口');
}
