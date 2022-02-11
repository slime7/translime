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
          <img v-else-if="image" :src="image" alt="" />
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
      default: 'primary',
      type: String,
    },
    textColor: {
      default: 'primary--text',
      type: String,
    },
    icon: {
      default: false,
      type: [Boolean, String, null],
    },
    image: {
      default: false,
      type: [Boolean, String, null],
    },
  },
};
</script>
