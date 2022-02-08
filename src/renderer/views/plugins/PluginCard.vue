<template>
  <v-hover
    v-slot="{ hover }"
  >
    <v-card
      class="plugin-item-card ease-animation"
      :elevation="hover ? 10 : 2"
    >
      <div class="d-flex flex-no-wrap justify-space-between">
        <div>
          <v-card-title
            class="text-h5"
            v-text="plugin.title"
          />

          <v-card-subtitle v-text="plugin.description" />

          <v-card-actions>
            <v-btn
              v-if="!plugin.enabled"
              class="ml-2 mt-3"
              fab
              icon
              height="40px"
              width="40px"
              @click="enable"
            >
              <v-icon>play_arrow</v-icon>
            </v-btn>

            <v-btn
              v-else
              class="ml-2 mt-3"
              fab
              icon
              height="40px"
              width="40px"
              @click="disable"
            >
              <v-icon>pause</v-icon>
            </v-btn>

            <v-btn
              class="ml-2 mt-3"
              fab
              icon
              height="40px"
              width="40px"
              @click="uninstall"
            >
              <v-icon>delete</v-icon>
            </v-btn>
          </v-card-actions>
        </div>

        <v-avatar
          class="ma-3"
          size="125"
          tile
        >
          <v-img v-if="plugin.icon" :src="plugin.icon" />
          <v-img v-else :src="defaultIcon" />
        </v-avatar>
      </div>
    </v-card>
  </v-hover>
</template>

<script>
import defaultIcon from '../../assets/plugin-default-image.png';

export default {
  name: 'PluginCard',

  props: {
    plugin: {
      type: Object,
      required: true,
    },
  },

  data: () => ({
    defaultIcon,
    uninstallConfirmVisible: false,
  }),

  methods: {
    uninstall() {
      this.$emit('uninstall', this.plugin.packageName);
    },
    disable() {
      this.$emit('disable', this.plugin.packageName);
    },
    enable() {
      this.$emit('enable', this.plugin.packageName);
    },
  },
};
</script>
