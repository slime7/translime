export const useClipboard = () => window.electron.clipboard;

export const useDialog = () => window.electron.dialog;

export const useNotify = () => window.electron.notification;

export const useIpc = (wrapped) => window.electron.useIpc(wrapped);
