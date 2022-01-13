<template>
  <div>
    <div>
      <div
        v-for="(version, lib) in versions"
        :key="lib"
      >
        <strong>{{ lib }}</strong>: v{{ version }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'About',

  data: () => ({
    versions: window.electron.versions,
  }),
};
</script>
