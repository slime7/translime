import { toRef } from '@vue/composition-api';
import useToastStore from '@/store/toastStore';

const useToast = () => {
  const toastStore = useToastStore();

  const show = (msg, timeout = 6000) => {
    toastStore.show({ msg, timeout });
  };
  const setVisibleState = (visible) => {
    toastStore.visible = visible;
  };

  return {
    show,
    setVisibleState,
    visible: toRef(toastStore, 'visible'),
    msg: toRef(toastStore, 'msg'),
  };
};

export default useToast;
