<template>
  <mat-snackbar
    :model-value="visible"
    :text="msg"
    :duration="0"
    position="center"
  />
</template>

<script>
import { computed } from 'vue';
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
