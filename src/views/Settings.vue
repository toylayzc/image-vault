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

    <van-cell-group title="存储管理 (七牛云)">
      <van-cell title="图片总数" :value="`${stats.total} 张`" />
      <van-cell title="已下载" :value="`${stats.downloaded} 张`" />
      <van-cell title="自动清理" :value="`${retainDays} 天后`" :label="`图片下载后 ${retainDays} 天自动从云端删除`" />
    </van-cell-group>

    <van-cell-group title="清理">
      <van-cell title="立即清理过期文件" is-link @click="onManualCleanup" />
      <van-cell title="清除所有图片数据" is-link @click="onClearAll" />
    </van-cell-group>

    <van-cell-group title="账号">
      <van-cell title="退出登录" is-link @click="onLogout" />
    </van-cell-group>

    <van-cell-group title="关于">
      <van-cell title="版本" value="1.1.0" />
      <van-cell title="说明" label="图片存储在服务器本地，元数据存储在浏览器本地。分享所有分组后，打开链接可看到每组的照片并一键下载。" />
    </van-cell-group>

    <van-dialog v-model:show="showClearConfirm" title="确认清除" show-cancel-button @confirm="doClearAll">
      <p style="padding:16px;margin:0;text-align:center;">确定要清除所有图片数据吗？此操作不可恢复！<br/>云端图片也会被删除。</p>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { showToast } from 'vant'
import { getSetting, setSetting } from '../utils/db.js'
import { batchDeleteFiles, fetchSyncData } from '../api/qiniu.js'
import config from '../config.js'

const threshold = ref(10)
const defaultGroupSize = ref(6)
const retainDays = ref(config.retainDays || 3)
const showClearConfirm = ref(false)
const stats = ref({ total: 0, downloaded: 0, notDownloaded: 0 })

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
  try {
    const data = await fetchSyncData()
    stats.value = {
      total: data.length,
      downloaded: 0,
      notDownloaded: data.length
    }
  } catch { stats.value = { total: 0, downloaded: 0, notDownloaded: 0 } }
}

watch(threshold, async (val) => { await setSetting('threshold', val) })
watch(defaultGroupSize, async (val) => { await setSetting('defaultGroupSize', val) })

async function onManualCleanup() {
  showToast('正在清理过期文件...')
  try {
    let cleanedShares = 0
    try {
      const resp = await fetch('/cleanup-expired-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retainDays: retainDays.value })
      })
      const result = await resp.json()
      cleanedShares = result.deleted || 0
    } catch (e) { console.warn('Share cleanup error:', e) }

    showToast(`已清理 ${cleanedShares} 个过期分享`)
    await loadStats()
  } catch (e) {
    console.error('Cleanup error:', e)
    showToast('清理失败')
  }
}

function onClearAll() {
  showClearConfirm.value = true
}

function onLogout() {
  localStorage.removeItem('loggedIn')
  window.location.reload()
}

async function doClearAll() {
  showToast('正在清空...')
  try {
    const data = await fetchSyncData()
    const keys = data.map(item => item.key).filter(Boolean)
    if (keys.length > 0) {
      await batchDeleteFiles(keys)
    }
    stats.value = { total: 0, downloaded: 0, notDownloaded: 0 }
    showToast(`已清除 ${keys.length} 张图片`)
  } catch (e) {
    console.error('Clear all error:', e)
    showToast('清除失败')
  }
}
</script>

<style scoped>
.settings-page {
  min-height: 100%;
  background: #f7f8fa;
  padding-bottom: 60px;
}
</style>
