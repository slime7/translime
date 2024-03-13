<template>
<footer>
  <toast/>
  <simple-dialog/>
  <alert-group/>
</footer>
</template>

<script>
import Toast from './Toast.vue';
import SimpleDialog from './SimpleDialog.vue';
import AlertGroup from './AlertGroup.vue';

export default {
  name: 'MainFooter',

  components: {
    Toast,
    SimpleDialog,
    AlertGroup,
  },
};
</script>
