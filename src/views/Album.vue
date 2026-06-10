<template>
  <div class="album-page">
    <van-nav-bar title="图片云库" safe-area-inset-top>
      <template #right>
        <van-icon name="plus" size="22" @click="showUploadSheet = true" />
      </template>
    </van-nav-bar>

    <!-- Result banner -->
    <van-notice-bar
      v-if="resultMessage"
      :text="resultMessage"
      color="#fff"
      background="#1989fa"
      mode="closeable"
      @close="resultMessage = ''"
    />

    <!-- Upload progress bar -->
    <div v-if="uploadProgress > 0 && uploadProgress < 100" class="progress-bar">
      <div class="progress-label">{{ processingStatus || '上传中' }} {{ uploadProgress }}%</div>
      <van-progress :percentage="uploadProgress" :stroke-width="6" color="#1989fa" />
    </div>

    <!-- Image count bar -->
    <div class="count-bar" v-if="images.length > 0">
      <span>共 {{ images.length }} 张图片</span>
      <van-button size="mini" plain type="danger" @click="showDeleteMode = !showDeleteMode">
        {{ showDeleteMode ? '完成' : '删除' }}
      </van-button>
    </div>

    <!-- Empty state -->
    <van-empty v-if="images.length === 0 && !loading" description="还没有图片，点击右上角 + 上传">
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
        <img :src="img.qiniuUrl" :alt="img.filename" />
        <!-- Delete mode overlay -->
        <div v-if="showDeleteMode" class="delete-overlay" @click.stop="confirmDelete(img)">
          <van-icon name="delete" size="28" color="#ee0a24" />
        </div>
        <!-- Group badge -->
        <div class="image-badge" v-if="img.groupIndex >= 0">
          {{ img.groupIndex + 1 }}
        </div>
        <!-- Downloaded badge -->
        <div class="downloaded-badge" v-if="img.downloaded">
          <van-icon name="down" size="12" />
        </div>
      </div>
    </div>

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
      accept="image/*,.livp,.HEIC,.heic,.JPG,.jpg,.jpeg,.PNG,.png"
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
      <p style="padding: 16px; margin: 0; text-align: center;">确定要删除这张图片吗？</p>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import { getAllImages, addImageMeta, getAllHashes, getAllFilenames, deleteImage, getSetting } from '../utils/db.js'
import { computeHash, isDuplicate } from '../utils/hash.js'
import { uploadFile, getImageUrl, getThumbnailUrl, batchDeleteFiles } from '../api/qiniu.js'
import heic2any from 'heic2any'
import JSZip from 'jszip'

const processingStatus = ref('') // 显示当前处理状态

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
const uploadProgress = ref(0)

const uploadActions = [
  { name: '从相册选择照片', key: 'album' },
  { name: '拍照', key: 'camera' }
]

onMounted(async () => {
  const t = await getSetting('threshold')
  if (t !== null) duplicateThreshold.value = t
  await loadImages()
})

async function loadImages() {
  loading.value = true
  try {
    const all = await getAllImages()
    // Convert qiniuUrl back from stored value
    images.value = all.map(img => ({
      ...img,
      thumbnailUrl: getThumbnailUrl(img.qiniuKey),
      qiniuUrl: img.qiniuUrl
    }))
  } catch (e) {
    console.error('Failed to load images:', e)
    showToast('加载图片失败')
    resultMessage.value = '加载图片失败'
    setTimeout(() => { resultMessage.value = '' }, 4000)
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
    input.addEventListener('change', (e) => onFileChange(e))
    input.click()
  } else {
    fileInput.value.click()
  }
}

async function onFileChange(event) {
  const files = event.target.files
  if (!files || files.length === 0) return

  loading.value = true
  const existingHashes = await getAllHashes()
  const existingFilenames = await getAllFilenames()

  let added = 0
  let duplicate = 0
  let nameDuplicate = 0
  let errors = 0
  let total = files.length
  let completed = 0

  for (const file of files) {
    let uploadFileObj = file
    let isConverted = false
    try {
      // Check filename duplicate first (cheaper than hash)
      if (existingFilenames.includes(file.name)) {
        nameDuplicate++
        completed++
        continue
      }

      const nameLower = file.name.toLowerCase()
      const isLivp = nameLower.endsWith('.livp')
      const isHeic = nameLower.endsWith('.heic') || nameLower.endsWith('.heif')

      // ===== Front-end conversion for LIVP: extract HEIC → convert to JPEG =====
      if (isLivp) {
        try {
          processingStatus.value = `解压 ${file.name}`
          uploadProgress.value = Math.floor((completed / total) * 100)

          const zipData = await file.arrayBuffer()
          const zip = await JSZip.loadAsync(zipData)
          let heicEntry = null
          zip.forEach((relPath, zipEntry) => {
            const lowPath = relPath.toLowerCase()
            if ((lowPath.endsWith('.heic') || lowPath.endsWith('.heif')) && !zipEntry.dir) {
              heicEntry = zipEntry
            }
          })

          if (heicEntry) {
            processingStatus.value = `转码 ${file.name}`
            const heicBlob = await heicEntry.async('blob')
            const jpegBlob = await heic2any({ blob: heicBlob, toType: 'image/jpeg' })
            const jpegResult = Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob
            uploadFileObj = new File([jpegResult], file.name.replace(/\.livp$/i, '.jpg'), { type: 'image/jpeg' })
            isConverted = true
          }
          // If no HEIC found inside, fallback to upload original LIVP
        } catch (convErr) {
          console.warn('LIVP conversion failed for', file.name, ', uploading original', convErr)
          uploadFileObj = file
        }
      }

      // ===== Front-end conversion for HEIC: convert to JPEG =====
      if (isHeic && !isConverted) {
        try {
          processingStatus.value = `转码 ${file.name}`
          uploadProgress.value = Math.floor((completed / total) * 100)

          const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg' })
          const jpegBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob
          uploadFileObj = new File([jpegBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
          isConverted = true
        } catch (convErr) {
          console.warn('HEIC conversion failed for', file.name, ', uploading original', convErr)
          uploadFileObj = file
        }
      }

      // ===== Compute hash (from JPEG for converted files) =====
      processingStatus.value = `分析 ${file.name}`
      let hash = ''
      try {
        hash = await computeHash(uploadFileObj)
        const dupCheck = isDuplicate(hash, existingHashes, duplicateThreshold.value)
        if (dupCheck.isDuplicate) {
          duplicate++
          completed++
          continue
        }
      } catch (hashErr) {
        console.warn('Hash computation failed for', file.name, ', skipping dedup')
        hash = (isLivp ? 'livp_' : 'skip_') + file.name
      }

      // ===== Upload =====
      processingStatus.value = `上传 ${file.name}`
      const result = await uploadFile(uploadFileObj, (percent) => {
        const overallPercent = Math.floor(((completed + (percent / 100)) / total) * 100)
        uploadProgress.value = overallPercent
      })

      const imgUrl = getImageUrl(result.key)

      await addImageMeta({
        qiniuKey: result.key,
        qiniuUrl: imgUrl,
        hash,
        filename: file.name,
        groupIndex: -1
      })

      existingHashes.push(hash)
      existingFilenames.push(file.name)
      added++
      completed++
    } catch (e) {
      console.error('Error processing file:', file.name, e)
      errors++
      completed++
    }
  }

  processingStatus.value = ''
  uploadProgress.value = 0
  loading.value = false
  event.target.value = ''

  const parts = []
  if (added > 0) parts.push(`成功上传 ${added} 张`)
  if (nameDuplicate > 0) parts.push(`跳过 ${nameDuplicate} 张同名`)
  if (duplicate > 0) parts.push(`跳过 ${duplicate} 张重复`)
  if (errors > 0) parts.push(`${errors} 张失败`)
  const msg = parts.join('，') || '上传完成'
  resultMessage.value = msg
  showToast({ message: msg, duration: 2500 })
  setTimeout(() => { resultMessage.value = '' }, 4000)

  await loadImages()
}

function confirmDelete(img) {
  deleteTarget.value = img
  showDeleteConfirm.value = true
}

async function doDeleteImage() {
  if (!deleteTarget.value) return
  // Delete from Qiniu
  try {
    await batchDeleteFiles([deleteTarget.value.qiniuKey])
  } catch (e) {
    console.warn('Qiniu delete error:', e)
  }
  // Delete metadata
  await deleteImage(deleteTarget.value.id)
  showDeleteConfirm.value = false
  deleteTarget.value = null
  showDeleteMode.value = false
  showToast('已删除')
  await loadImages()
}

function previewImage(img) {
  const idx = images.value.findIndex(i => i.id === img.id)
  previewImages.value = images.value.map(i => i.qiniuUrl || i.thumbnailUrl)
  previewStart.value = idx
  showPreview.value = true
}
</script>

<style scoped>
.album-page {
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: 60px;
}

.progress-bar {
  padding: 8px 12px;
  background: #fff;
}

.progress-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
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
  background: #e8e8e8;
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

.downloaded-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(7, 193, 96, 0.85);
  color: #fff;
  width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
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
