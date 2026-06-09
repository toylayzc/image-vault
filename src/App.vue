<template>
  <div class="app-container">
    <!-- Tab content -->
    <Album v-if="activeTab === 'album'" />
    <Groups v-if="activeTab === 'groups'" />
    <Settings v-if="activeTab === 'settings'" />

    <!-- Bottom tab bar -->
    <van-tabbar v-model="activeTab" active-color="#1989fa" border>
      <van-tabbar-item name="album" icon="photo-o">相册</van-tabbar-item>
      <van-tabbar-item name="groups" icon="columns-o">分组</van-tabbar-item>
      <van-tabbar-item name="settings" icon="setting-o">设置</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Album from './views/Album.vue'
import Groups from './views/Groups.vue'
import Settings from './views/Settings.vue'

const activeTab = ref('album')
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
  padding-bottom: 50px; /* space for tab bar */
  box-sizing: border-box;
  overflow-y: auto;
}
</style>
