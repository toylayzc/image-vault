<template>
  <div class="app-container" :class="{ 'shared-mode': isSharedView }">
    <!-- Login page -->
    <Login v-if="!isSharedView && !isLoggedIn" @login-success="isLoggedIn = true" />

    <!-- Shared view route -->
    <SharedViewer v-if="isSharedView" />

    <!-- Main app tabs -->
    <template v-if="!isSharedView && isLoggedIn">
      <Album v-if="activeTab === 'album'" />
      <Groups v-if="activeTab === 'groups'" />
      <Settings v-if="activeTab === 'settings'" />

      <van-tabbar v-model="activeTab" active-color="#1989fa" border>
        <van-tabbar-item name="album" icon="photo-o">相册</van-tabbar-item>
        <van-tabbar-item name="groups" icon="columns-o">分组</van-tabbar-item>
        <van-tabbar-item name="settings" icon="setting-o">设置</van-tabbar-item>
      </van-tabbar>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'

// Dynamic imports — only load what the user visits
const Album = defineAsyncComponent(() => import('./views/Album.vue'))
const Groups = defineAsyncComponent(() => import('./views/Groups.vue'))
const Settings = defineAsyncComponent(() => import('./views/Settings.vue'))
const SharedViewer = defineAsyncComponent(() => import('./views/SharedViewer.vue'))
const Login = defineAsyncComponent(() => import('./views/Login.vue'))
import config from './config.js'

const activeTab = ref('album')
const isLoggedIn = ref(!!localStorage.getItem('loggedIn'))

const isSharedView = computed(() => {
  return window.location.hash.startsWith('#/share/')
})

// Auto-cleanup: notify server to remove expired share files
onMounted(async () => {
  if (isSharedView.value || !isLoggedIn.value) return

  try {
    // Cleanup expired shares
    const resp = await fetch('/cleanup-expired-shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retainDays: config.retainDays })
    })
    const result = await resp.json()
    if (result.deleted > 0) console.log(`Cleaned ${result.deleted} expired shares`)
  } catch (e) { console.warn('Share cleanup error:', e) }
})
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f7f8fa;
  -webkit-tap-highlight-color: transparent;
}

.app-container {
  height: 100%;
  box-sizing: border-box;
  overflow-y: auto;
}

.app-container:not(.shared-mode) {
  padding-bottom: 50px;
}
</style>
