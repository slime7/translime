const createNaviDirective = (app) => {
  const clickEv = (binding) => {
    if (binding.modifiers.replace) {
      app.config.globalProperties.$router.replace(binding.value);
    } else {
      app.config.globalProperties.$router.push(binding.value);
    }
  };

  return {
    mounted(el, binding) {
      el.addEventListener('click', clickEv.bind(null, binding));
    },
    unmounted(el) {
      el.removeEventListener('click', clickEv);
    },
  };
};

export default createNaviDirective;
