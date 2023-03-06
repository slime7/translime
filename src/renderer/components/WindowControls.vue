<template>
  <div class="window-controls fill-height">
    <div class="d-flex fill-height">
      <div class="window-control-btn d-flex align-center justify-center fill-height" @click="appMinimize">
        <svg width='11' height='11' viewBox='0 0 11 11' fill='none'
             xmlns='http://www.w3.org/2000/svg'>
          <path
            :d='icon.minimize'
            fill='currentColor'/>
        </svg>
      </div>

      <div class="window-control-btn d-flex align-center justify-center fill-height" v-if="isMaximize" @click="appUnmaximize">
        <svg width='11' height='11' viewBox='0 0 11 11' fill='none'
             xmlns='http://www.w3.org/2000/svg'>
          <path
            :d='icon.unmaximize'
            fill='currentColor'/>
        </svg>
      </div>

      <div class="window-control-btn d-flex align-center justify-center fill-height" v-if="!isMaximize" @click="appMaximize">
        <svg width='11' height='11' viewBox='0 0 11 11' fill='none'
             xmlns='http://www.w3.org/2000/svg'>
          <path
            :d='icon.maximize'
            fill='currentColor'/>
        </svg>
      </div>

      <div class="window-control-btn close d-flex align-center justify-center fill-height" @click="appClose">
        <svg width='11' height='11' viewBox='0 0 11 11' fill='none'
             xmlns='http://www.w3.org/2000/svg'>
          <path
            :d='icon.close'
            fill='currentColor'/>
        </svg>
      </div>
    </div>
  </div>
</template>

<script>
import { toRefs } from 'vue';
import {
  APP_MINIMIZE,
  APP_MAXIMIZE,
  APP_UNMAXIMIZE,
  APP_CLOSE,
} from '@pkg/share/utils/ipcConstant';
import { useIpc } from '@/hooks/electron';

export default {
  name: 'WindowControls',

  props: {
    isMaximize: {
      type: Boolean,
      default: false,
    },
    win: {
      default: 'app',
      type: String,
    },
  },

  setup(props, { emit }) {
    const ipc = useIpc();

    const { win } = toRefs(props);
    const icon = {
      minimize: 'M11 4.399V5.5H0V4.399h11z',
      unmaximize: 'M11 8.798H8.798V11H0V2.202h2.202V0H11v8.798zm-3.298-5.5h-6.6v6.6h6.6v-6.6zM9.9 1.1H3.298v1.101h5.5v5.5h1.1v-6.6z',
      maximize: 'M11 0v11H0V0h11zM9.899 1.101H1.1V9.9h8.8V1.1z',
      close: 'M6.279 5.5L11 10.221l-.779.779L5.5 6.279.779 11 0 10.221 4.721 5.5 0 .779.779 0 5.5 4.721 10.221 0 11 .779 6.279 5.5z',
    };

    const appMinimize = () => {
      ipc.send(APP_MINIMIZE, win.value);
      emit('windowMinimize');
    };
    const appUnmaximize = () => {
      ipc.send(APP_UNMAXIMIZE, win.value);
      emit('windowUnmaximize');
    };
    const appMaximize = () => {
      ipc.send(APP_MAXIMIZE, win.value);
      emit('windowMaximize');
    };
    const appClose = () => {
      ipc.send(APP_CLOSE, win.value);
      emit('windowClose');
    };

    return {
      icon,
      appMinimize,
      appUnmaximize,
      appMaximize,
      appClose,
    };
  },
};
</script>

<style scoped>
.window-control-btn {
  width: 40px;
  height: 24px;
  cursor: default;
  -webkit-app-region: no-drag;
}

.window-control-btn:hover {
  background-color: rgba(0, 0, 0, .2);
}
@media (prefers-color-scheme: dark) {
  .window-control-btn:hover {
    background-color: rgba(255, 255, 255, .3);
  }
}

.window-control-btn.close:hover {
  background-color: rgba(232, 17, 35, 0.9) !important;
}

.window-control-btn.close:hover path {
  fill: #fff;
}
</style>
