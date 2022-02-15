<template>
<div class="plugin-main">plugin content {{ msg }}</div>
</template>

<script>
export default {
  name: 'ui',

  data: () => ({
    msg: 'hello',
  }),
};
</script>

<style scoped>
.plugin-main {
  color: red;
}
</style>
