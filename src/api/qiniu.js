/**
 * 七牛云 API 封装
 * 处理文件上传、分享数据存储、文件删除
 */
import * as qiniu from 'qiniu-js'
import config from '../config.js'

// 缓存的上传凭证（每小时刷新）
let cachedToken = null
let tokenExpireTime = 0

async function getUploadToken() {
  if (cachedToken && Date.now() < tokenExpireTime) return cachedToken
  const resp = await fetch('/upload-token', { method: 'POST' })
  if (!resp.ok) throw new Error('获取上传凭证失败: ' + resp.status)
  const data = await resp.json()
  cachedToken = data.token
  tokenExpireTime = Date.now() + 55 * 60 * 1000
  return cachedToken
}

export async function uploadFile(file, key, onProgress) {
  const token = await getUploadToken()
  return new Promise((resolve, reject) => {
    const observable = qiniu.upload(file, key, token, {
      fname: file.name,
      mimeType: file.type
    }, {
      useCdnDomain: false,
      uphost: ['up.qiniup.com', 'upload.qiniup.com', 'up.qiniu.com', 'upload.qiniu.com']
    })
    observable.subscribe({
      next(res) {
        const percent = Math.floor((res.total.loaded / res.total.size) * 100)
        if (onProgress) onProgress(percent)
      },
      error(err) { reject(err) },
      complete(res) {
        resolve({ key: res.key, hash: res.hash, fsize: res.fsize })
      }
    })
  })
}

export function getImageUrl(key) {
  return `${config.cdnDomain}/${key}`
}

export function getThumbnailUrl(key, width = 200, height = 200) {
  return `${config.cdnDomain}/${key}?imageView2/1/w/${width}/h/${height}`
}

export async function uploadShareData(shareId, data) {
  const jsonStr = JSON.stringify(data)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const key = config.sharePrefix + shareId + '.json'
  return await uploadFile(blob, key)
}

export async function fetchShareData(shareId) {
  try {
    const url = getImageUrl(config.sharePrefix + shareId + '.json')
    const resp = await fetch(url)
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

export async function batchDeleteFiles(keys) {
  if (!keys || keys.length === 0) return
  try {
    const resp = await fetch('/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys })
    })
    if (!resp.ok) console.warn('删除失败:', resp.status)
    return await resp.json()
  } catch (e) {
    console.warn('删除API不可达:', e.message)
  }
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
