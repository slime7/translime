<template>
<v-sheet
  class="card-radio-group overflow-hidden rounded"
  :color="sheetColor"
  :dark="$vuetify.theme.dark"
>
  <v-list-item link @click="onClick($event)">
    <v-list-item-action>
      <v-icon v-if="!value">radio_button_unchecked</v-icon>
      <v-icon color="primary" v-else>radio_button_checked</v-icon>
    </v-list-item-action>

    <v-list-item-content>
      <v-list-item-title><slot></slot></v-list-item-title>
      <v-list-item-subtitle><slot name="subtitle"></slot></v-list-item-subtitle>
    </v-list-item-content>
  </v-list-item>
</v-sheet>
</template>

<script>
import { computed } from '@vue/composition-api';

export default {
  name: 'CardRadio',

  props: {
    value: {
      type: Boolean,
      default: false,
    },
  },

  setup(props, { emit, root }) {
    const onClick = (ev) => {
      emit('click', ev);
    };

    const sheetColor = computed(() => {
      let color = '';
      if (root.$vuetify.theme.dark) {
        color = props.value ? 'grey darken-4' : 'grey darken-3';
      } else {
        color = props.value ? 'grey lighten-1' : 'grey lighten-2';
      }
      return color;
    });

    return {
      sheetColor,
      onClick,
    };
  },
};
</script>
