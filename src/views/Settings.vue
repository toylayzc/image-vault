<template>
  <div class="settings-page">
    <van-nav-bar title="设置" safe-area-inset-top />

    <van-cell-group title="去重设置">
      <van-cell title="去重阈值" center>
        <template #value>
          <van-stepper v-model="threshold" min="1" max="30" step="1" />
        </template>
      </van-cell>
      <van-cell :title="`阈值说明：值越小去重越严格 (当前 ${threshold})`" :label="thresholdLabel" />
    </van-cell-group>

    <van-cell-group title="分组设置">
      <van-cell title="默认每组张数" center>
        <template #value>
          <van-stepper v-model="defaultGroupSize" min="1" max="50" step="1" />
        </template>
      </van-cell>
    </van-cell-group>

    <van-cell-group title="数据管理">
      <van-cell title="图片总数" :value="`${imageCount} 张`" />
      <van-cell title="占用空间" :value="storageSize" />
      <van-cell title="清除所有图片" is-link @click="onClearAll" />
    </van-cell-group>

    <van-cell-group title="关于">
      <van-cell title="版本" value="1.0.0" />
      <van-cell title="说明" label="纯浏览器端图片管理工具，所有图片仅存储在本地浏览器中，不会上传到任何服务器。" />
    </van-cell-group>

    <!-- Clear confirm dialog -->
    <van-dialog v-model:show="showClearConfirm" title="确认清除" show-cancel-button @confirm="doClearAll">
      <p style="padding: 16px; margin: 0; text-align: center;">
        确定要清除所有图片数据吗？此操作不可恢复！
      </p>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { showToast } from 'vant'
import { getAllImages, clearAllImages, getSetting, setSetting } from '../utils/db.js'

const threshold = ref(10)
const defaultGroupSize = ref(6)
const imageCount = ref(0)
const storageSize = ref('计算中...')
const showClearConfirm = ref(false)

const thresholdLabel = computed(() => {
  if (threshold.value <= 5) return '非常严格 - 几乎相同的图片才会判重'
  if (threshold.value <= 10) return '推荐 - 相似图片会判重'
  if (threshold.value <= 20) return '宽松 - 仅高度相似的图片判重'
  return '非常宽松 - 仅完全一致的图片判重'
})

onMounted(async () => {
  await loadSettings()
  await loadStats()
})

async function loadSettings() {
  const t = await getSetting('threshold')
  if (t !== null) threshold.value = t
  const g = await getSetting('defaultGroupSize')
  if (g !== null) defaultGroupSize.value = g
}

async function loadStats() {
  const images = await getAllImages()
  imageCount.value = images.length

  let totalBytes = 0
  for (const img of images) {
    totalBytes += img.blob.size
  }
  storageSize.value = formatBytes(totalBytes)
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Watch changes and save
watch(threshold, async (val) => {
  await setSetting('threshold', val)
})
watch(defaultGroupSize, async (val) => {
  await setSetting('defaultGroupSize', val)
})

function onClearAll() {
  showClearConfirm.value = true
}

async function doClearAll() {
  await clearAllImages()
  imageCount.value = 0
  storageSize.value = '0 B'
  showToast('已清除所有图片')
}
</script>

<style scoped>
.settings-page {
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: 60px;
}
</style>
