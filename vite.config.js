import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [VantResolver()]
    }),
    Components({
      resolvers: [VantResolver()]
    })
  ],
  // GitHub Pages: https://toylayzc.github.io/image-vault/
  base: process.env.GH_DEPLOY ? '/image-vault/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
