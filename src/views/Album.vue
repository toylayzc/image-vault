<template>
  <div class="album-page">
    <van-nav-bar title="图片云库" safe-area-inset-top>
      <template #right>
        <van-icon name="plus" size="22" @click="showUploadSheet = true" />
      </template>
    </van-nav-bar>

    <!-- Image count bar -->
    <div class="count-bar" v-if="images.length > 0">
      <span>共 {{ images.length }} 张图片</span>
      <van-button size="mini" plain type="danger" @click="showDeleteMode = !showDeleteMode">
        {{ showDeleteMode ? '完成' : '删除' }}
      </van-button>
    </div>

    <!-- Empty state -->
    <van-empty v-if="images.length === 0" description="还没有图片，点击右上角 + 上传">
      <template #image>
        <van-icon name="photo-o" size="80" color="#c8c9cc" />
      </template>
    </van-empty>

    <!-- Image grid -->
    <div class="image-grid" v-if="images.length > 0">
      <div
        class="image-item"
        v-for="img in images"
        :key="img.id"
        @click="!showDeleteMode && previewImage(img)"
      >
        <img :src="img.thumbnailUrl" :alt="img.filename" />
        <!-- Delete mode overlay -->
        <div v-if="showDeleteMode" class="delete-overlay" @click.stop="confirmDelete(img)">
          <van-icon name="delete" size="28" color="#ee0a24" />
        </div>
        <!-- Group badge -->
        <div class="image-badge" v-if="img.groupIndex >= 0">
          {{ img.groupIndex + 1 }}
        </div>
      </div>
    </div>

    <!-- Result banner -->
    <van-notice-bar v-if="resultMessage" :text="resultMessage" color="#fff" background="#1989fa" mode="closeable" @close="resultMessage = ''" />

    <!-- Loading -->
    <van-loading v-if="loading" class="loading-center" size="24px">处理中...</van-loading>

    <!-- Upload action sheet -->
    <van-action-sheet
      v-model:show="showUploadSheet"
      :actions="uploadActions"
      @select="onUploadSelect"
      cancel-text="取消"
      close-on-click-action
    />

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      style="display: none"
      @change="onFileChange"
    />

    <!-- Image preview -->
    <van-image-preview
      v-model:show="showPreview"
      :images="previewImages"
      :start-position="previewStart"
      close-on-popstate
    >
      <template v-slot:index>
        {{ previewStart + 1 }} / {{ previewImages.length }}
      </template>
    </van-image-preview>

    <!-- Delete confirm dialog -->
    <van-dialog
      v-model:show="showDeleteConfirm"
      title="确认删除"
      show-cancel-button
      @confirm="doDeleteImage"
    >
      <p style="padding: 16px; margin: 0; text-align: center;">
        确定要删除这张图片吗？
      </p>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { showToast } from 'vant'
import { getAllImages, addImage, getAllHashes, deleteImage, getSetting } from '../utils/db.js'
import { computeHash, isDuplicate } from '../utils/hash.js'

const images = ref([])
const loading = ref(false)
const showUploadSheet = ref(false)
const showDeleteMode = ref(false)
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null)
const fileInput = ref(null)
const showPreview = ref(false)
const previewImages = ref([])
const previewStart = ref(0)
const duplicateThreshold = ref(10)
const resultMessage = ref('')

const uploadActions = [
  { name: '从相册选择照片', key: 'album' },
  { name: '拍照', key: 'camera' }
]

onMounted(async () => {
  // Load dedup threshold from settings
  const t = await getSetting('threshold')
  if (t !== null) duplicateThreshold.value = t
  const g = await getSetting('defaultGroupSize')
  if (g !== null) {
    // Store in session for Groups page to use
    sessionStorage.setItem('defaultGroupSize', g)
  }
  await loadImages()
})

async function loadImages() {
  loading.value = true
  try {
    // Revoke old object URLs to prevent memory leaks
    for (const img of images.value) {
      if (img.thumbnailUrl) URL.revokeObjectURL(img.thumbnailUrl)
    }
    const all = await getAllImages()
    images.value = all.map((img) => ({
      ...img,
      thumbnailUrl: URL.createObjectURL(img.blob)
    }))
  } catch (e) {
    console.error('Failed to load images:', e)
    showToast('加载图片失败')
    resultMessage.value = '加载图片失败'
  } finally {
    loading.value = false
  }
}

function onUploadSelect(action) {
  showUploadSheet.value = false
  if (action.key === 'camera') {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.multiple = true
    input.style.display = 'none'
    input.addEventListener('change', (e) => onFileChange(e))
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  } else {
    fileInput.value.click()
  }
}

async function onFileChange(event) {
  const files = event.target.files
  if (!files || files.length === 0) return

  loading.value = true

  // Get existing hashes
  const existingHashes = await getAllHashes()

  let added = 0
  let duplicate = 0
  let errors = 0

  for (const file of files) {
    try {
      // Compute perceptual hash
      const hash = await computeHash(file)

      // Check for duplicates
      const dupCheck = isDuplicate(hash, existingHashes, duplicateThreshold.value)
      if (dupCheck.isDuplicate) {
        duplicate++
        continue
      }

      // Convert file to blob and store
      const blob = await file.arrayBuffer().then(buf => new Blob([buf], { type: file.type }))

      await addImage(blob, hash, file.name)
      existingHashes.push(hash)
      added++
    } catch (e) {
      console.error('Error processing file:', file.name, e)
      errors++
    }
  }

  loading.value = false
  event.target.value = '' // reset input

  const parts = []
  if (added > 0) parts.push(`成功上传 ${added} 张`)
  if (duplicate > 0) parts.push(`跳过 ${duplicate} 张重复`)
  if (errors > 0) parts.push(`${errors} 张失败`)
  const msg = parts.join('，') || '上传完成'
  
  // Show result both as toast and as visible banner
  resultMessage.value = msg
  showToast({ message: msg, duration: 2500 })
  
  // Auto-clear banner after 4 seconds
  setTimeout(() => { resultMessage.value = '' }, 4000)

  await loadImages()
}

function confirmDelete(img) {
  deleteTarget.value = img
  showDeleteConfirm.value = true
}

async function doDeleteImage() {
  if (!deleteTarget.value) return
  await deleteImage(deleteTarget.value.id)
  showDeleteConfirm.value = false
  deleteTarget.value = null
  showDeleteMode.value = false
  showToast('已删除')
  await loadImages()
}

function previewImage(img) {
  const idx = images.value.findIndex(i => i.id === img.id)
  previewImages.value = images.value.map(i => i.thumbnailUrl)
  previewStart.value = idx
  showPreview.value = true
}

// Revoke URLs on unmount
onUnmounted(() => {
  for (const img of images.value) {
    if (img.thumbnailUrl) URL.revokeObjectURL(img.thumbnailUrl)
  }
})
</script>

<style scoped>
.album-page {
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: 60px;
}

.count-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #fff;
  font-size: 13px;
  color: #666;
  border-bottom: 1px solid #f0f0f0;
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
  background: #fff;
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(25, 137, 250, 0.85);
  color: #fff;
  font-size: 11px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.delete-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.loading-center {
  display: flex;
  justify-content: center;
  padding-top: 40px;
}
</style>
