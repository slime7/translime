<template>
  <v-snackbar
    :value="visible"
    bottom
    timeout="-1"
  >
    {{msg}}
  </v-snackbar>
</template>

<script>
import useToastStore from '@/store/toastStore';

export default {
  name: 'Toast',

  setup() {
    const toastStore = useToastStore();

    return {
      msg: toastStore.msg,
      visible: toastStore.visible,
    };
  },
};
</script>
