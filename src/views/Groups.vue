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
            <van-field
              v-model="groupSize"
              label="每组"
              type="number"
              inputmode="numeric"
              placeholder="张数"
              :rules="[{ required: true, message: '请输入' }]"
            >
              <template #extra>张</template>
            </van-field>
          </van-col>
          <van-col span="8">
            <van-button type="primary" native-type="submit" size="small" block icon="columns-o">
              自动分组
            </van-button>
          </van-col>
          <van-col span="8">
            <van-button type="warning" size="small" block icon="exchange" @click="onReshuffle">
              打乱
            </van-button>
          </van-col>
        </van-row>
      </van-form>

      <!-- Quick group presets -->
      <div class="presets" v-if="images.length > 0">
        <span class="preset-label">快捷：</span>
        <van-tag
          v-for="preset in presets"
          :key="preset"
          :type="preset === groupSize ? 'primary' : 'default'"
          size="medium"
          style="margin-right: 6px; cursor: pointer;"
          @click="groupSize = preset"
        >
          {{ preset }}张/组
        </van-tag>
      </div>
    </div>

    <!-- Group summary -->
    <div class="summary-bar" v-if="groups.length > 0">
      <span>共 {{ images.length }} 张 → {{ groups.length }} 组</span>
      <van-button size="mini" plain @click="onReshuffle">重新打乱</van-button>
    </div>

    <!-- Group list -->
    <div class="group-list" v-if="groups.length > 0">
      <van-cell v-for="(group, idx) in groups" :key="idx" center @click="showGroupDetail(idx)">
        <template #title>
          <span class="group-title">第 {{ idx + 1 }} 组</span>
        </template>
        <template #label>
          <div class="group-preview">
            <img
              v-for="img in group.slice(0, 5)"
              :key="img.id"
              :src="img.url"
              class="group-thumb"
            />
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
      <van-nav-bar
        :title="`第 ${currentGroupIdx + 1} 组 (${currentGroup.length} 张)`"
        left-arrow
        @click-left="showDetail = false"
        :safe-area-inset-top="true"
      />
      <div class="detail-grid">
        <div class="detail-image-item" v-for="(img, i) in currentGroup" :key="img.id">
          <img :src="img.url" :alt="img.filename" />
          <div class="detail-index">{{ i + 1 }}</div>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { showToast } from 'vant'
import { getAllImages, updateImageGroup, getSetting } from '../utils/db.js'
import { autoGroup, shuffle } from '../utils/group.js'

const images = ref([])
const groups = ref([])
const groupSize = ref(6)
const showDetail = ref(false)
const currentGroupIdx = ref(0)
const currentGroup = ref([])

const presets = computed(() => {
  const total = images.value.length
  const sizes = [2, 3, 4, 6, 8, 10, 12]
  return sizes.filter(s => total >= s)
})

onMounted(async () => {
  // Load default group size from settings
  const g = await getSetting('defaultGroupSize')
  if (g !== null) groupSize.value = g
  await loadImages()
})

async function loadImages() {
  const all = await getAllImages()
  images.value = all.map(img => ({
    ...img,
    url: URL.createObjectURL(img.blob)
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
  if (Object.keys(grouped).length > 0) {
    groups.value = Object.entries(grouped)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([_, imgs]) => imgs)
  } else {
    groups.value = []
  }
}

async function onAutoGroup() {
  if (!groupSize.value || groupSize.value < 1) {
    showToast('请输入有效的每组张数')
    return
  }
  const size = parseInt(groupSize.value)
  const result = autoGroup(images.value, size, true)
  groups.value = result

  // Persist group assignments
  for (let gi = 0; gi < result.length; gi++) {
    for (const img of result[gi]) {
      await updateImageGroup(img.id, gi)
    }
  }

  showToast(`已分为 ${result.length} 组，每组 ${size} 张`)
}

async function onReshuffle() {
  if (groups.value.length === 0) {
    showToast('请先自动分组')
    return
  }

  if (groups.value.flat().length !== images.value.length) {
    // Some images may not be in groups, regroup all
    const size = parseInt(groupSize.value) || Math.ceil(images.value.length / groups.value.length)
    const result = autoGroup(images.value, size, true)
    groups.value = result
    for (let gi = 0; gi < result.length; gi++) {
      for (const img of result[gi]) {
        await updateImageGroup(img.id, gi)
      }
    }
  } else {
    const allImages = groups.value.flat()
    const shuffled = shuffle(allImages)
    const size = parseInt(groupSize.value) || Math.ceil(allImages.length / groups.value.length)
    const newGroups = []
    for (let i = 0; i < shuffled.length; i += size) {
      newGroups.push(shuffled.slice(i, i + size))
    }
    groups.value = newGroups
    for (let gi = 0; gi < newGroups.length; gi++) {
      for (const img of newGroups[gi]) {
        await updateImageGroup(img.id, gi)
      }
    }
  }

  showToast('已重新打乱分组')
}

function showGroupDetail(idx) {
  currentGroupIdx.value = idx
  currentGroup.value = groups.value[idx] || []
  showDetail.value = true
}
</script>

<style scoped>
.groups-page {
  min-height: 100%;
  background: #f7f8fa;
}

.control-bar {
  padding: 12px;
  background: #fff;
  margin-bottom: 2px;
}

.control-row {
  align-items: flex-start;
}

.presets {
  display: flex;
  align-items: center;
  padding: 8px 0 0;
  flex-wrap: wrap;
  gap: 4px;
}

.preset-label {
  font-size: 12px;
  color: #999;
  margin-right: 4px;
  white-space: nowrap;
}

.summary-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: #fff;
  font-size: 13px;
  color: #666;
  border-bottom: 1px solid #f0f0f0;
}

.group-list {
  padding-bottom: 60px;
}

.group-title {
  font-weight: 500;
  font-size: 15px;
}

.group-preview {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  align-items: center;
}

.group-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
}

.group-more {
  font-size: 11px;
  color: #999;
  padding-left: 2px;
}

.group-count {
  font-size: 13px;
  color: #999;
  margin-right: 4px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
  padding-bottom: 30px;
}

.detail-image-item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: #fff;
}

.detail-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.detail-index {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
