import useDialogStore from '@/store/dialogStore';

const useDialog = () => {
  const dialogStore = useDialogStore();

  const confirm = (content, title = null) => {
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
    confirm,
    show,
    showLoader,
    hideLoader,
  };
};

export default useDialog;
