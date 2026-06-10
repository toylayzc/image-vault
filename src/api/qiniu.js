/**
 * 图片 API 封装
 * 所有图片存储在服务器本地 /uploads/ 目录
 */
import config from '../config.js'

/**
 * 上传单张图片到服务器
 * @param {File} file
 * @param {Function} onProgress 进度回调
 * @returns {Promise<{key: string, url: string, fsize: number}>}
 */
export async function uploadFile(file, onProgress) {
  const formData = new FormData()
  formData.append('file', file)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/upload')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.floor((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error('上传失败: ' + xhr.status))
      }
    }

    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.send(formData)
  })
}

/**
 * 批量上传
 */
export async function uploadFiles(files, onProgress) {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  const resp = await fetch('/uploads', { method: 'POST', body: formData })
  if (!resp.ok) throw new Error('上传失败: ' + resp.status)
  return await resp.json()
}

/**
 * 获取图片的访问 URL
 */
export function getImageUrl(key) {
  return '/uploads/' + key
}

/**
 * 获取缩略图 URL（服务器 sharp 生成 200px 缩略图）
 */
export function getThumbnailUrl(key) {
  return '/thumbnail/' + key
}

/**
 * 获取服务器所有文件列表
 */
export async function fetchAllFiles() {
  const resp = await fetch('/files')
  if (!resp.ok) throw new Error('获取文件列表失败')
  const data = await resp.json()
  return data.items || []
}

/**
 * 保存分享数据（所有分组一起分享）
 * POST /save-share-data → 用指定 shareId 保存到 shares/ 目录
 */
export async function saveShareData(shareId, groups) {
  const resp = await fetch('/save-share-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareId, groups })
  })
  if (!resp.ok) throw new Error('保存分享数据失败: ' + resp.status)
  return await resp.json()
}

/**
 * 获取分享数据（通过 API）
 */
export async function fetchShareData(shareId) {
  try {
    const resp = await fetch('/share-data/' + shareId)
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

/**
 * 删除分享数据
 */
export async function deleteShareData(shareId) {
  const resp = await fetch('/share-data/' + shareId, { method: 'DELETE' })
  if (!resp.ok) console.warn('删除分享数据失败:', resp.status)
  return await resp.json()
}

/**
 * 批量删除文件
 */
export async function batchDeleteFiles(keys) {
  if (!keys || keys.length === 0) return
  const resp = await fetch('/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys })
  })
  if (!resp.ok) console.warn('删除失败:', resp.status)
  return await resp.json()
}

/**
 * 生成唯一 ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
