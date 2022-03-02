import useToastStore from '@/store/toastStore';

const useToast = () => {
  const toastStore = useToastStore();

  const show = (msg, timeout = 6000) => {
    toastStore.show({ msg, timeout });
  };

  return {
    show,
  };
};

export default useToast;
