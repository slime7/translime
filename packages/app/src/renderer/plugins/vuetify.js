// eslint-disable-next-line import/extensions
import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { zhHans } from 'vuetify/locale';
import { aliases, md } from 'vuetify/iconsets/md';

const vuetify = createVuetify({
  locale: {
    locale: 'zhHans',
    messages: { zhHans },
  },
  icons: {
    defaultSet: 'md',
    aliases,
    sets: {
      md,
    },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          background: '#f2f2f2',
          primary: '#039be5', // light-blue-darken-1
        },
      },
      dark: {
        colors: {
          primary: '#039be5',
        },
      },
    },
  },
  defaults: {
    VBtn: {
      class: 'text-none',
    },
    global: {
      style: [{
        fontFamily: '"Roboto", "Noto Sans SC", "Microsoft YaHei", "微软雅黑", sans-serif',
      }],
    },
  },
});

export default vuetify;
