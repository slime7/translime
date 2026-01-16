import { storeToRefs } from 'pinia';
import useDialogStore from '@/store/dialogStore';

const useDialog = () => {
  const dialogStore = useDialogStore();

  const {
    dialogs,
    titleClass,
    loader,
    confirm,
  } = storeToRefs(dialogStore);

  const showConfirm = async (content, title = null) => {
    const payload = {
      content,
    };
    if (title) {
      payload.title = title;
    }
    const result = {
      confirm: true,
      cancel: false,
    };
    try {
      await dialogStore.showConfirm(payload);
    } catch (err) {
      result.confirm = false;
      result.cancel = true;
    } finally {
      dialogStore.clearConfirm();
    }
    return result;
  };

  const show = (content, title, attr = {}, hideClose = false) => {
    dialogStore.append({
      content,
      title,
      hideClose,
      attr,
    });
  };

  const showLoader = () => {
    dialogStore.loader = true;
  };

  const hideLoader = () => {
    dialogStore.loader = false;
  };

  return {
    dialogs,
    titleClass,
    loader,
    confirm,
    showConfirm,
    show,
    pop: dialogStore.pop,
    showLoader,
    hideLoader,
  };
};

export default useDialog;
