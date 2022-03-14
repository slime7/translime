const {
  clipboard,
  dialog,
  notification,
} = window.electron;

export const useClipboard = () => clipboard;

export const useDialog = () => dialog;

export const useNotify = () => notification;

export const { useIpc } = window.electron;
