<template>
  <v-hover v-slot="{ hover }">
    <router-link
      :to="to"
      custom
      v-slot="{ isExactActive, href }"
    >
      <a class="text-decoration-none d-block ease-animation" :href="href">
        <v-avatar
          class="ease-animation"
          size="56"
          :color="hover || isExactActive ? color : 'grey darken-2'"
          :rounded="hover || isExactActive ? 'xl' : 'circle'"
        >
          <v-icon v-if="icon" :color="hover || isExactActive ? 'white' : color">{{ icon }}</v-icon>
          <div v-else :class="hover || isExactActive ? 'white--text' : textColor">
            <slot></slot>
          </div>
        </v-avatar>
      </a>
    </router-link>
  </v-hover>
</template>

<script>
export default {
  name: 'NaviLink',

  props: {
    to: [Object, String],
    color: {
      default: 'light-blue accent-2',
      type: String,
    },
    textColor: {
      default: 'light-blue--text text--accent-2',
      type: String,
    },
    icon: {
      default: false,
      type: [Boolean, String, null],
    },
  },
};
</script>
