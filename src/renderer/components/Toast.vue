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
import { computed } from '@vue/composition-api';
import useToast from '@/hooks/useToast';

export default {
  name: 'Toast',

  setup() {
    const toast = useToast();
    const visible = computed({
      get() {
        return toast.visible.value;
      },
      set(value) {
        toast.setVisibleState(value);
      },
    });

    return {
      msg: toast.msg,
      visible,
    };
  },
};
</script>
