<template>
  <div class="shared-page">
    <!-- Loading -->
    <van-loading v-if="loading" class="loading-center" size="24px">加载分享数据...</van-loading>

    <!-- Error -->
    <van-empty v-if="error" :description="error" />

    <!-- Share content -->
    <template v-if="shareData && !loading">
      <van-nav-bar :title="shareData.groupName || '分享相册'" safe-area-inset-top>
        <template #right>
          <van-button size="small" type="primary" icon="down" @click="downloadAll" :loading="downloading">
            一键下载
          </van-button>
        </template>
      </van-nav-bar>

      <!-- Image grid -->
      <div class="share-description">
        <span>共 {{ shareData.images.length }} 张照片</span>
        <span v-if="downloading" style="margin-left:8px;color:#1989fa">
          下载中 {{ downloadProgress }}/{{ shareData.images.length }}
        </span>
      </div>

      <div class="image-grid">
        <div class="image-item" v-for="(img, idx) in shareData.images" :key="idx">
          <img :src="getImageUrl(img.key)" :alt="img.filename" @click="previewIdx = idx; showPreview = true" loading="lazy" />
        </div>
      </div>

      <!-- Preview -->
      <van-image-preview v-model:show="showPreview" :images="previewImages" :start-position="previewIdx">
        <template v-slot:index>{{ previewIdx + 1 }} / {{ previewImages.length }}</template>
      </van-image-preview>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { showToast } from 'vant'
import { fetchShareData, getImageUrl } from '../api/qiniu.js'

const loading = ref(true)
const error = ref('')
const shareData = ref(null)
const downloading = ref(false)
const downloadProgress = ref(0)
const showPreview = ref(false)
const previewIdx = ref(0)

const previewImages = computed(() => {
  if (!shareData.value) return []
  return shareData.value.images.map(img => getImageUrl(img.key))
})

onMounted(async () => {
  // Parse share ID from URL hash: #/share/SHARE_ID
  const hash = window.location.hash
  const match = hash.match(/^#\/share\/(.+)$/)
  if (!match) {
    error.value = '无效的分享链接'
    loading.value = false
    return
  }

  const shareId = match[1]
  try {
    const data = await fetchShareData(shareId)
    if (!data) {
      error.value = '分享数据不存在或已过期'
      loading.value = false
      return
    }
    shareData.value = data
  } catch (e) {
    console.error('Failed to load share:', e)
    error.value = '加载分享数据失败'
  } finally {
    loading.value = false
  }
})

async function downloadAll() {
  if (!shareData.value || downloading.value) return

  downloading.value = true
  downloadProgress.value = 0

  for (let i = 0; i < shareData.value.images.length; i++) {
    const img = shareData.value.images[i]
    try {
      const url = getImageUrl(img.key)
      const resp = await fetch(url)
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = blobUrl
      a.download = img.filename || `photo_${i + 1}.jpg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)

      downloadProgress.value = i + 1

      // Small delay between downloads
      await new Promise(r => setTimeout(r, 300))
    } catch (e) {
      console.error(`Failed to download ${img.filename}:`, e)
    }
  }

  downloading.value = false
  showToast(`已下载 ${downloadProgress.value} 张照片`)
}
</script>

<style scoped>
.shared-page {
  min-height: 100%;
  background: #f7f8fa;
}

.share-description {
  padding: 8px 12px;
  font-size: 13px;
  color: #666;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}

.loading-center {
  display: flex;
  justify-content: center;
  padding-top: 80px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: #e8e8e8;
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: pointer;
}
</style>
