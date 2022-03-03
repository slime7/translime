import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();

// eslint-disable-next-line import/prefer-default-export
export const showTextEditContextMenu = () => {
  ipc.send(ipcType.SHOW_TEXT_EDIT_CONTEXT);
};
