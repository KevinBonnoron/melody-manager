import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Melody Manager',
  description: 'Self-hosted music library manager — aggregate, stream, and manage your music from multiple sources',

  base: '/melody-manager/',

  vite: {
    server: { port: 5000 },
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/guide/api' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Docker', link: '/guide/docker' },
          { text: 'Sonos Integration', link: '/guide/sonos' },
          { text: 'API Reference', link: '/guide/api' },
        ],
      },
    ],

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/KevinBonnoron/melody-manager',
      },
    ],

    footer: {
      message: 'Released under the MIT License.',
    },
  },
});
