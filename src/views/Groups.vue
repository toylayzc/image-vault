<template>
  <div class="groups-page">
    <van-nav-bar title="分组管理" safe-area-inset-top />

    <!-- No images -->
    <van-empty v-if="images.length === 0" description="还没有图片，请先上传照片" />

    <!-- Control bar -->
    <div class="control-bar" v-if="images.length > 0">
      <van-form @submit="onAutoGroup">
        <van-row align="center" gutter="8" class="control-row">
          <van-col span="8">
            <van-field v-model="groupSize" label="每组" type="number" inputmode="numeric" placeholder="张数">
              <template #extra>张</template>
            </van-field>
          </van-col>
          <van-col span="8">
            <van-button type="primary" native-type="submit" size="small" block icon="columns-o">自动分组</van-button>
          </van-col>
          <van-col span="8">
            <van-button type="warning" size="small" block icon="exchange" @click="onReshuffle">打乱</van-button>
          </van-col>
        </van-row>
      </van-form>

      <div class="presets" v-if="images.length > 0">
        <span class="preset-label">快捷：</span>
        <van-tag v-for="p in presets" :key="p" :type="p == groupSize ? 'primary' : 'default'" size="medium" style="margin-right:6px;cursor:pointer" @click="groupSize = p">{{ p }}张/组</van-tag>
      </div>
    </div>

    <!-- Group summary -->
    <div class="summary-bar" v-if="groups.length > 0">
      <span>共 {{ images.length }} 张 → {{ groups.length }} 组</span>
      <div class="summary-actions">
        <van-button size="mini" plain type="primary" icon="share-o" @click="onShareAll" :loading="sharingAll">分享所有分组</van-button>
        <van-button size="mini" plain @click="onReshuffle" style="margin-left:6px">重新打乱</van-button>
      </div>
    </div>

    <!-- Group list -->
    <div class="group-list" v-if="groups.length > 0">
      <van-cell v-for="(group, idx) in groups" :key="idx" center @click="showGroupDetail(idx)">
        <template #title>
          <span class="group-title">第 {{ idx + 1 }} 组</span>
          <van-tag v-if="isDownloaded(idx)" type="warning" size="mini" style="margin-left:4px">已下载</van-tag>
        </template>
        <template #label>
          <div class="group-preview">
            <img v-for="img in group.slice(0,5)" :key="img.id" :src="img.thumbnailUrl" class="group-thumb" />
            <span v-if="group.length > 5" class="group-more">+{{ group.length - 5 }}</span>
          </div>
        </template>
        <template #value>
          <span class="group-count">{{ group.length }} 张</span>
          <van-icon name="arrow" />
        </template>
      </van-cell>
    </div>

    <!-- Group detail popup -->
    <van-popup v-model:show="showDetail" position="bottom" round :style="{ height: '75vh' }">
      <van-nav-bar :title="`第 ${currentGroupIdx + 1} 组 (${currentGroup.length} 张)`" left-arrow @click-left="showDetail = false" />
      <div class="detail-grid">
        <div class="detail-image-item" v-for="(img, i) in currentGroup" :key="img.id">
          <img :src="img.thumbnailUrl" :alt="img.filename" />
          <div class="detail-index">{{ i + 1 }}</div>
        </div>
      </div>
    </van-popup>

    <!-- Share dialog -->
    <van-dialog v-model:show="showShareDialog" title="分享所有分组" confirm-button-text="复制链接" @confirm="copyShareLink">
      <div style="padding:16px">
        <p>已生成分享链接，可查看所有分组：</p>
        <div style="background:#f5f5f5;padding:8px;border-radius:4px;font-size:12px;word-break:break-all">{{ shareLink }}</div>
        <p style="color:#999;font-size:12px;margin-top:8px">打开链接可看到全部 {{ groups.length }} 组照片<br/>每人可找到自己的组并一键下载<br/>分享数据 3 天后自动清理</p>
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { showToast } from 'vant'
import { getSetting, setSetting } from '../utils/db.js'
import { autoGroup, shuffle } from '../utils/group.js'
import { saveShareData, generateId, getThumbnailUrl, fetchSyncData, batchUpdateMeta } from '../api/qiniu.js'

const images = ref([])
const groups = ref([])
const groupSize = ref(6)
const showDetail = ref(false)
const currentGroupIdx = ref(0)
const currentGroup = ref([])
const showShareDialog = ref(false)
const shareLink = ref('')
const sharingAll = ref(false)

const presets = computed(() => {
  const total = images.value.length
  return [2, 3, 4, 6, 8, 10, 12].filter(s => total >= s)
})

onMounted(async () => {
  const g = await getSetting('defaultGroupSize')
  if (g !== null) groupSize.value = g
  await loadImages()
})

async function loadImages() {
  const data = await fetchSyncData()
  images.value = data.map(item => ({
    id: item.key,
    qiniuKey: item.key,
    qiniuUrl: '/uploads/' + item.key,
    thumbnailUrl: getThumbnailUrl(item.key),
    hash: item.hash,
    filename: item.filename,
    groupIndex: item.groupIndex,
    downloaded: item.downloaded
  }))
  await restoreGroups()
}

async function restoreGroups() {
  const grouped = {}
  for (const img of images.value) {
    if (img.groupIndex >= 0) {
      if (!grouped[img.groupIndex]) grouped[img.groupIndex] = []
      grouped[img.groupIndex].push(img)
    }
  }
  groups.value = Object.keys(grouped).length > 0
    ? Object.entries(grouped).sort(([a],[b]) => parseInt(a)-parseInt(b)).map(([_,imgs]) => imgs)
    : []
}

function isDownloaded(groupIdx) {
  const group = groups.value[groupIdx]
  return group && group.some(img => img.downloaded)
}

async function onAutoGroup() {
  if (!groupSize.value || groupSize.value < 1) {
    showToast('请输入有效的每组张数')
    return
  }
  const size = parseInt(groupSize.value)
  const result = autoGroup(images.value, size, true)
  groups.value = result
  // Sync group indices to server
  const updates = []
  for (let gi = 0; gi < result.length; gi++) {
    for (const img of result[gi]) {
      updates.push({ key: img.qiniuKey, groupIndex: gi })
    }
  }
  await batchUpdateMeta(updates)
  showToast(`已分为 ${result.length} 组，每组 ${size} 张`)
}

async function onReshuffle() {
  if (groups.value.length === 0) { showToast('请先自动分组'); return }
  const size = parseInt(groupSize.value) || Math.ceil(images.value.length / groups.value.length)
  const allImages = groups.value.flat()
  const shuffled = shuffle(allImages)
  const newGroups = []
  for (let i = 0; i < shuffled.length; i += size) {
    newGroups.push(shuffled.slice(i, i + size))
  }
  groups.value = newGroups
  // Sync to server
  const updates = []
  for (let gi = 0; gi < newGroups.length; gi++) {
    for (const img of newGroups[gi]) {
      updates.push({ key: img.qiniuKey, groupIndex: gi })
    }
  }
  await batchUpdateMeta(updates)
  showToast('已重新打乱分组')
}

function showGroupDetail(idx) {
  currentGroupIdx.value = idx
  currentGroup.value = groups.value[idx] || []
  showDetail.value = true
}

async function onShareAll() {
  if (groups.value.length === 0) { showToast('请先自动分组'); return }
  const flatCount = groups.value.reduce((sum, g) => sum + g.length, 0)
  if (flatCount === 0) { showToast('没有可分享的图片'); return }

  try {
    sharingAll.value = true
    showToast('正在生成分享链接...')
    const shareId = generateId()

    // 构建所有分组数据
    const groupsData = groups.value.map((group, idx) => ({
      groupIndex: idx,
      groupName: `第 ${idx + 1} 组`,
      images: group.map(img => ({
        key: img.qiniuKey,
        filename: img.filename
      }))
    }))

    // 保存到服务器
    await saveShareData(shareId, groupsData)

    // 生成链接
    shareLink.value = `${window.location.origin}${window.location.pathname}#/share/${shareId}`
    showShareDialog.value = true
  } catch (e) {
    console.error('Share error:', e)
    showToast('分享失败')
  } finally {
    sharingAll.value = false
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    showToast('链接已复制到剪贴板')
  } catch {
    // Fallback
    const ta = document.createElement('textarea')
    ta.value = shareLink.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    showToast('链接已复制')
  }
  showShareDialog.value = false
}
</script>

<style scoped>
.groups-page { min-height: 100%; background: #f7f8fa; }
.control-bar { padding: 12px; background: #fff; margin-bottom: 2px; }
.control-row { align-items: flex-start; }
.presets { display: flex; align-items: center; padding: 8px 0 0; flex-wrap: wrap; gap: 4px; }
.preset-label { font-size: 12px; color: #999; margin-right: 4px; white-space: nowrap; }
.summary-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #fff; font-size: 13px; color: #666; border-bottom: 1px solid #f0f0f0; }
.summary-actions { display: flex; align-items: center; white-space: nowrap; }
.group-list { padding-bottom: 60px; }
.group-title { font-weight: 500; font-size: 15px; }
.group-preview { display: flex; gap: 4px; margin-top: 6px; align-items: center; }
.group-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 4px; }
.group-more { font-size: 11px; color: #999; padding-left: 2px; }
.group-count { font-size: 13px; color: #999; margin-right: 4px; }
.detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; padding-bottom: 30px; }
.detail-image-item { position: relative; aspect-ratio: 1; overflow: hidden; background: #fff; }
.detail-image-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.detail-index { position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.6); color: #fff; font-size: 11px; min-width: 20px; height: 20px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
</style>
