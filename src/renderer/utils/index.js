import { ref, reactive } from '@vue/composition-api';
import * as ipcType from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';

const ipc = useIpc();

export const showTextEditContextMenu = () => {
  const selectedText = window.getSelection().toString();
  ipc.send(ipcType.SHOW_TEXT_EDIT_CONTEXT, { selectedText });
};

export const useState = (initialValue) => {
  if (typeof initialValue === 'object') {
    const state = reactive(initialValue);
    const setValue = (newValue) => {
      if (typeof newValue === 'function') {
        newValue(state);
      } else {
        Object.entries(newValue).forEach(([key, val]) => {
          state[key] = val;
        });
      }
    };
    return [state, setValue];
  }
  const state = ref(initialValue);
  const setValue = (newValue) => {
    if (typeof newValue === 'function') {
      state.value = newValue(state.value);
    } else {
      state.value = newValue;
    }
  };
  return [state, setValue];
};
