<template>
  <v-scroll-y-reverse-transition
    group
    tag="div"
    class="alert-group"
  >
    <v-alert
      v-for="alertItem in activeList"
      :key="alertItem.uuid"
      :type="alertItem.type"
      border="left"
      dismissible
    >
      {{ alertItem.msg }}

      <template v-slot:close>
        <v-btn class="v-alert__dismissible" small icon @click="dismiss(alertItem.uuid)">
          <v-icon>cancel</v-icon>
        </v-btn>
      </template>
    </v-alert>
  </v-scroll-y-reverse-transition>
</template>

<script>
import useAlert from '@/hooks/useAlert';

export default {
  name: 'AlertGroup',

  setup() {
    const alert = useAlert();
    const { list, activeList, dismiss } = alert;

    return {
      list,
      activeList,
      dismiss,
    };
  },
};
</script>

<style scoped>
.alert-group {
  position: fixed;
  right: 16px;
  bottom: 16px;
  width: 480px;
  max-width: 100%;
}
</style>
