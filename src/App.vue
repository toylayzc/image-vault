<template>
  <div class="app-container" :class="{ 'shared-mode': isSharedView }">
    <!-- Shared view route -->
    <SharedViewer v-if="isSharedView" />

    <!-- Main app tabs -->
    <template v-if="!isSharedView">
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
import { ref, computed, onMounted } from 'vue'
import Album from './views/Album.vue'
import Groups from './views/Groups.vue'
import Settings from './views/Settings.vue'
import SharedViewer from './views/SharedViewer.vue'
import { getExpiredShares, getExpiredDownloadedImages, deleteShare, deleteImage } from './utils/db.js'
import { batchDeleteFiles } from './api/qiniu.js'
import config from './config.js'

const activeTab = ref('album')

const isSharedView = computed(() => {
  return window.location.hash.startsWith('#/share/')
})

// Auto-cleanup: check expired files on mount
onMounted(async () => {
  if (isSharedView.value) return

  try {
    // Expired images (downloaded > retainDays ago)
    const expiredImgs = await getExpiredDownloadedImages(config.retainDays)
    if (expiredImgs.length > 0) {
      console.log(`Cleanup: ${expiredImgs.length} expired images`)
      const keys = expiredImgs.map(img => img.qiniuKey)
      try { await batchDeleteFiles(keys) } catch (e) { console.warn(e) }
      for (const img of expiredImgs) { await deleteImage(img.id) }
    }

    // Expired shares
    const expiredShares = await getExpiredShares(config.retainDays)
    for (const share of expiredShares) {
      if (share.shareId) {
        try { await batchDeleteFiles([`${config.sharePrefix}${share.shareId}.json`]) } catch {}
      }
      await deleteShare(share.shareId)
    }
  } catch (e) {
    console.warn('Auto-cleanup error:', e)
  }
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
