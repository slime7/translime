<template>
  <v-sheet
    class="card-radio-group overflow-hidden rounded"
    :color="sheetColor"
    :dark="vTheme.global.current.value.dark"
  >
    <v-list-item link :lines="lines" @click="onClick($event)">
      <template v-slot:prepend>
        <v-list-item-action start>
          <v-radio color="primary" :model-value="value" />
        </v-list-item-action>
      </template>

      <v-list-item-title>
        <slot></slot>
      </v-list-item-title>
      <v-list-item-subtitle>
        <slot name="subtitle"></slot>
      </v-list-item-subtitle>
    </v-list-item>
  </v-sheet>
</template>

<script>
import { computed } from 'vue';
import { useTheme as useVTheme } from 'vuetify';

export default {
  name: 'CardRadio',

  props: {
    value: {
      type: Boolean,
      default: false,
    },
    lines: {
      type: String,
      default: 'one',
    },
  },

  setup(props, { emit }) {
    const vTheme = useVTheme();

    const onClick = (ev) => {
      emit('click', ev);
    };

    const sheetColor = computed(() => {
      let color = '';
      if (vTheme.global.current.value.dark) {
        color = props.value ? 'grey-darken-4' : 'grey-darken-3';
      } else {
        color = props.value ? 'grey-lighten-1' : 'grey-lighten-2';
      }
      return color;
    });

    return {
      sheetColor,
      onClick,
      vTheme,
    };
  },
};
</script>
