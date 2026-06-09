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
  // 本地开发用 '/' ; Gitee Pages 部署时改为 '/仓库名/'
  base: process.env.GITEE_DEPLOY ? '/your-repo-name/' : '/',
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
