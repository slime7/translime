<template>
  <v-container fluid class="plugin-main">
    <div>
      <v-text-field
        v-model="pai"
        label="手牌"
        placeholder="123m456p789s5z x11x 0p"
        outlined
        hide-details
        @change="copied = false"
      />
    </div>

    <div class="mt-4">
      <v-btn color="primary" @click="copy">{{ copied ? '已' : '' }}复制</v-btn>
    </div>

    <div class="emoji mt-4">
      {{ parsedPai }}
    </div>
  </v-container>
</template>

<script>
import mahjongEmoji from './emoji.json';

const vuetify = window.vuetify$.components;

export default {
  name: 'PluginUi',

  components: {
    ...vuetify,
  },

  data: () => ({
    pai: '',
    copied: false,
  }),

  computed: {
    parsedPai() {
      const p = [];
      const blocks = this.splitPai(this.pai);
      blocks.forEach((block) => {
        const pais = this.parseBlock(block);
        if (p.length && pais.length) {
          p.push(' ', ...pais);
        } else if (!p.length && pais.length) {
          p.push(...pais);
        }
      });
      return p.map((pai) => mahjongEmoji[pai]).join('');
    },
  },

  methods: {
    splitPai(pai) {
      return pai.trim().split(/\s+/);
    },
    parseBlock(block) {
      const isBlockReg = /^(?:(?:\d+[mps])|(?:[1-7]+[z])|x)+$/is;
      const matchBlockReg = /(?:\d+[mps])|(?:[1-7]+[z])|x/gi;
      const isBlock = isBlockReg.test(block);
      if (!isBlock) {
        return [];
      }
      const subBlocks = block.match(matchBlockReg);
      return subBlocks.map((subBlock) => this.parseSubBlock(subBlock)).flat();
    },
    parseSubBlock(subBlock) {
      if (subBlock.toLowerCase() === 'x') {
        return ['x'];
      }
      const subBlockArray = subBlock.split('');
      return subBlockArray
        .slice(0, -1)
        .map((n) => `${n}${subBlockArray.at(-1).toLowerCase()}`);
    },
    copy() {
      window.electron.clipboard.writeText(this.parsedPai);
      this.copied = true;
    },
  },
};
</script>

<style scoped>
.emoji {
  font-size: 3rem;
}
</style>
