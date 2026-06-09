/**
 * 七牛云 API 封装
 * 处理文件上传、分享数据存储、文件删除
 */
import * as qiniu from 'qiniu-js'
import config from '../config.js'

/**
 * 从 Worker 获取上传凭证
 */
async function fetchUploadToken() {
  const resp = await fetch(config.workerUrl + '/upload-token', { method: 'POST' })
  if (!resp.ok) throw new Error('获取上传凭证失败: ' + resp.status)
  const data = await resp.json()
  return data.token
}

/**
 * 上传文件到七牛云
 * @param {File|Blob} file
 * @param {string} key 七牛云上的文件路径
 * @param {Function} onProgress 进度回调 (0-100)
 * @returns {Promise<{key: string, hash: string, fsize: number}>}
 */
export async function uploadFile(file, key, onProgress) {
  const token = await fetchUploadToken()

  return new Promise((resolve, reject) => {
    const observable = qiniu.upload(file, key, token, {
      fname: file.name,
      mimeType: file.type,
      useCdnDomain: true
    }, {
      // qiniu-js v3.x uses next/error/complete
    })

    // qiniu-js v3 subscription
    const observer = {
      next(res) {
        const percent = Math.floor((res.total.loaded / res.total.size) * 100)
        if (onProgress) onProgress(percent)
      },
      error(err) {
        reject(err)
      },
      complete(res) {
        resolve({
          key: res.key,
          hash: res.hash,
          fsize: res.fsize
        })
      }
    }

    observable.subscribe(observer)
  })
}

/**
 * 生成七牛云图片的公开访问 URL
 */
export function getImageUrl(key) {
  return `${config.cdnDomain}/${key}`
}

/**
 * 生成缩略图 URL（使用七牛云图片处理）
 */
export function getThumbnailUrl(key, width = 200, height = 200) {
  return `${config.cdnDomain}/${key}?imageView2/1/w/${width}/h/${height}`
}

/**
 * 上传分享数据（分组信息存为 JSON 文件）
 * @param {string} shareId
 * @param {object} data - 分享数据 { groupName, images: [{key, filename}], createdAt }
 */
export async function uploadShareData(shareId, data) {
  const jsonStr = JSON.stringify(data)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const key = config.sharePrefix + shareId + '.json'
  return await uploadFile(blob, key)
}

/**
 * 获取分享数据
 * @param {string} shareId
 * @returns {Promise<object|null>}
 */
export async function fetchShareData(shareId) {
  try {
    const url = getImageUrl(config.sharePrefix + shareId + '.json')
    const resp = await fetch(url)
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

/**
 * 批量删除七牛云文件
 * @param {string[]} keys
 */
export async function batchDeleteFiles(keys) {
  if (!keys || keys.length === 0) return
  const resp = await fetch(config.workerUrl + '/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys })
  })
  if (!resp.ok) throw new Error('删除失败: ' + resp.status)
  return await resp.json()
}

/**
 * 生成唯一 ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
