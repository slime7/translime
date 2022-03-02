import useDialogStore from '@/store/dialogStore';

const useDialog = () => {
  const dialogStore = useDialogStore();

  const showConfirm = (content, title = null) => {
    const payload = {
      content,
    };
    if (title) {
      payload.title = title;
    }
    return new Promise(async (resolve) => {
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
      resolve(result);
    });
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
    dialogs: dialogStore.dialogs,
    titleClass: dialogStore.titleClass,
    loader: dialogStore.loader,
    confirm: dialogStore.confirm,
    showConfirm,
    show,
    pop: dialogStore.pop,
    showLoader,
    hideLoader,
  };
};

export default useDialog;
