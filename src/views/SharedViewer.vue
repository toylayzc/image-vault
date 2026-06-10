<template>
  <div class="shared-page">
    <!-- Loading -->
    <van-loading v-if="loading" class="loading-center" size="24px">加载分享数据...</van-loading>

    <!-- Error -->
    <van-empty v-if="error" :description="error" />

    <!-- Share content -->
    <template v-if="shareData && !loading">
      <van-nav-bar title="分享相册" safe-area-inset-top />

      <!-- Overview -->
      <div class="overview-bar">
        <span>共 {{ totalGroups }} 组，{{ totalImages }} 张照片</span>
        <span style="color:#999;font-size:12px;margin-left:8px">找到你的组，点击下载</span>
      </div>

      <!-- Group list -->
      <div class="group-list">
        <div class="group-card" v-for="(group, gIdx) in shareData.groups" :key="gIdx">
          <!-- Group header -->
          <div class="group-header">
            <span class="group-title">{{ group.groupName }}</span>
            <span class="group-count">{{ group.images.length }} 张</span>
          </div>

          <!-- Thumbnails preview -->
          <div class="group-previews">
            <img
              v-for="(img, i) in group.images.slice(0, 6)"
              :key="i"
              :src="getThumbnailUrl(img.key)"
              :alt="img.filename"
              class="preview-thumb"
              @click="previewGroup(gIdx, i)"
            />
            <div v-if="group.images.length > 6" class="preview-more" @click="previewGroup(gIdx, 0)">
              +{{ group.images.length - 6 }}
            </div>
          </div>

          <!-- Download button -->
          <div class="group-actions">
            <van-button
              size="small"
              type="primary"
              icon="down"
              :loading="downloadingGroup === gIdx"
              @click="downloadGroup(gIdx)"
              block
            >
              {{ downloadingGroup === gIdx ? `下载中 ${downloadProgress[gIdx] || 0}/${group.images.length}` : '一键下载本组照片' }}
            </van-button>
          </div>
        </div>
      </div>

      <!-- Image preview -->
      <van-image-preview v-model:show="showPreview" :images="previewImages" :start-position="previewStart">
        <template v-slot:index>{{ previewStart + 1 }} / {{ previewImages.length }}</template>
      </van-image-preview>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import { fetchShareData, getImageUrl, getThumbnailUrl } from '../api/qiniu.js'

const loading = ref(true)
const error = ref('')
const shareData = ref(null)
const showPreview = ref(false)
const previewImages = ref([])
const previewStart = ref(0)
const downloadingGroup = ref(-1)
const downloadProgress = ref({})

const totalGroups = ref(0)
const totalImages = ref(0)

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
    if (!data || !data.groups || data.groups.length === 0) {
      error.value = '分享数据不存在或已过期'
      loading.value = false
      return
    }
    shareData.value = data
    totalGroups.value = data.groups.length
    totalImages.value = data.groups.reduce((sum, g) => sum + g.images.length, 0)
  } catch (e) {
    console.error('Failed to load share:', e)
    error.value = '加载分享数据失败'
  } finally {
    loading.value = false
  }
})

function previewGroup(gIdx, imgIdx) {
  const start = shareData.value.groups.slice(0, gIdx).reduce((s, g) => s + g.images.length, 0) + imgIdx
  previewImages.value = shareData.value.groups.flatMap(g => g.images.map(img => getImageUrl(img.key)))
  previewStart.value = start
  showPreview.value = true
}

async function downloadGroup(gIdx) {
  const group = shareData.value.groups[gIdx]
  if (!group || group.images.length === 0 || downloadingGroup.value >= 0) return

  downloadingGroup.value = gIdx
  downloadProgress.value = { ...downloadProgress.value, [gIdx]: 0 }

  for (let i = 0; i < group.images.length; i++) {
    const img = group.images[i]
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

      downloadProgress.value = { ...downloadProgress.value, [gIdx]: i + 1 }

      // Small delay between downloads
      await new Promise(r => setTimeout(r, 300))
    } catch (e) {
      console.error(`Failed to download ${img.filename}:`, e)
    }
  }

  showToast(`第 ${gIdx + 1} 组已下载 ${downloadProgress.value[gIdx]} 张照片`)
  downloadingGroup.value = -1
}
</script>

<style scoped>
.shared-page {
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: 30px;
}

.overview-bar {
  padding: 10px 16px;
  font-size: 13px;
  color: #333;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.loading-center {
  display: flex;
  justify-content: center;
  padding-top: 80px;
}

.group-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-card {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px 6px;
}

.group-title {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.group-count {
  font-size: 13px;
  color: #999;
}

.group-previews {
  display: flex;
  gap: 2px;
  padding: 0 12px 8px;
  overflow-x: auto;
}

.preview-thumb {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  cursor: pointer;
  background: #e8e8e8;
}

.preview-more {
  width: 52px;
  height: 52px;
  border-radius: 4px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
  cursor: pointer;
}

.group-actions {
  padding: 0 12px 10px;
}
</style>
