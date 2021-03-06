import Vue from 'vue';
import Vuetify from 'vuetify';
import zhHans from 'vuetify/es5/locale/zh-Hans';
import colors from 'vuetify/lib/util/colors';

Vue.use(Vuetify);

export default new Vuetify({
  lang: {
    locales: { zhHans },
    current: 'zhHans',
  },
  icons: {
    iconfont: 'md',
  },
  theme: {
    themes: {
      light: {
        primary: colors.lightBlue.darken1,
      },
      dark: {
        primary: colors.lightBlue.darken1,
      },
    },
  },
});
