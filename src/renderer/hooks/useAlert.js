import { toRef } from '@vue/composition-api';
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

  const list = alertStore.contents;
  const activeList = alertStore.activeAlerts;
  const drawerVisible = toRef(alertStore, 'drawerVisible');

  return {
    show,
    hide,
    list,
    activeList,
    showDrawer,
    hideDrawer,
    drawerVisible,
  };
};

export default useAlert;
