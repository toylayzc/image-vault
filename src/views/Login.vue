<template>
  <div class="login-page">
    <van-nav-bar title="图片云库" safe-area-inset-top />
    <div class="login-container">
      <div class="login-icon">
        <van-icon name="photo-o" size="64" color="#1989fa" />
      </div>
      <h2 class="login-title">欢迎回来</h2>
      <p class="login-desc">请输入账号密码继续</p>

      <van-form @submit="onLogin" class="login-form">
        <van-cell-group inset>
          <van-field
            v-model="username"
            name="username"
            label="账号"
            placeholder="请输入账号"
            :rules="[{ required: true, message: '请输入账号' }]"
            clearable
          />
          <van-field
            v-model="password"
            type="password"
            name="password"
            label="密码"
            placeholder="请输入密码"
            :rules="[{ required: true, message: '请输入密码' }]"
            clearable
          />
        </van-cell-group>

        <div style="margin: 20px 16px">
          <van-button round block type="primary" native-type="submit" :loading="loading">
            登 录
          </van-button>
        </div>
      </van-form>

      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'

const emit = defineEmits(['login-success'])

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

const VALID_USERNAME = '牛牛最帅'
const VALID_PASSWORD = 'niuniuzuishuai'

async function onLogin() {
  loading.value = true
  errorMsg.value = ''

  // Simulate a short delay for UX
  await new Promise(r => setTimeout(r, 300))

  if (username.value === VALID_USERNAME && password.value === VALID_PASSWORD) {
    localStorage.setItem('loggedIn', 'true')
    showToast('登录成功')
    emit('login-success')
  } else {
    errorMsg.value = '账号或密码错误'
    showToast('账号或密码错误')
  }

  loading.value = false
}
</script>

<style scoped>
.login-page {
  height: 100%;
  background: #f7f8fa;
}

.login-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px 0;
}

.login-icon {
  margin-bottom: 16px;
}

.login-title {
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  color: #333;
}

.login-desc {
  margin: 8px 0 30px;
  font-size: 14px;
  color: #999;
}

.login-form {
  width: 100%;
  max-width: 360px;
}

.error-msg {
  color: #ee0a24;
  font-size: 14px;
  margin-top: 12px;
}
</style>
