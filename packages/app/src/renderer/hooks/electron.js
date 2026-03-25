import * as ipcType from '@pkg/share/utils/ipcConstant';

export const useClipboard = () => ({
  readText: async () => {
    if (window.electron?.useIpc) {
      return window.electron.useIpc().invoke(ipcType.READ_CLIPBOARD_TEXT);
    }
    if (navigator.clipboard?.readText) {
      return navigator.clipboard.readText();
    }
    throw new Error('clipboard.readText 不可用');
  },
  writeText: async (text) => {
    if (window.electron?.useIpc) {
      return window.electron.useIpc().invoke(ipcType.COPY_TEXT, text);
    }
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }
    throw new Error('clipboard.writeText 不可用');
  },
});

export const useDialog = () => window.electron.dialog;

export const useNotify = () => window.electron.notification;

export const useIpc = (wrapped) => window.electron.useIpc(wrapped);
