<template>
  <transition-group
    name="alert-list"
    tag="div"
    class="alert-group"
  >
    <div
      v-for="alertItem in activeList"
      :key="alertItem.uuid"
      class="alert-item flex items-start gap-1 px-4 py-3 rounded-lg"
      :class="alertItem.type === 'error'
        ? 'bg-error-container text-on-error-container'
        : 'bg-secondary-container text-on-secondary-container'"
    >
      <div class="grow">
        {{ alertItem.msg }}
      </div>

      <mat-btn
        icon="cancel"
        label="关闭"
        variant="text"
        class="shrink-0"
        @click="dismiss(alertItem.uuid)"
      />
    </div>
  </transition-group>
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
  z-index: 30;
}

.alert-item + .alert-item {
  margin-top: 8px;
}

.alert-list-enter-active,
.alert-list-leave-active {
  transition: all .25s cubic-bezier(0, 0, 0, 1);
}

.alert-list-enter-from,
.alert-list-leave-to {
  opacity: 0;
  transform: translateY(16px);
}
</style>
