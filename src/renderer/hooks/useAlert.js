import { storeToRefs } from 'pinia';
import useAlertStore from '@/store/alertStore';

const useAlert = () => {
  const alertStore = useAlertStore();

  const show = (msg, type = 'info') => {
    alertStore.push({ msg, type });
  };

  const hide = (uuid) => {
    alertStore.dismiss({ uuid });
  };

  const showDrawer = () => {
    alertStore.setDrawerVisible(true);
  };

  const hideDrawer = () => {
    alertStore.setDrawerVisible(false);
  };

  const { contents, activeAlerts, drawerVisible } = storeToRefs(alertStore);
  console.log(storeToRefs(alertStore));

  return {
    show,
    hide,
    list: contents,
    activeList: activeAlerts,
    showDrawer,
    hideDrawer,
    drawerVisible,
  };
};

export default useAlert;
