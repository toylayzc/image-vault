/**
 * 七牛云 API 封装
 * 处理文件上传、分享数据存储、文件删除
 */
import * as qiniu from 'qiniu-js'
import config from '../config.js'

// 预生成的上传 token（30天有效）
// 到期后运行 node scripts/gen-token.js 重新生成后替换
const UPLOAD_TOKEN = 'ok1FbdAJHr53s-_FRRnS2p3srnEh7q4PmydlgrQl:7Tw_jtjqiInJ5Xji9RLjSK1i_AI:eyJzY29wZSI6ImltYWdlLXZhdWx0LWVzIiwiZGVhZGxpbmUiOjE3ODM2MDgyNDMsInJldHVybkJvZHkiOiJ7XCJrZXlcIjpcIiQoa2V5KVwiLFwiaGFzaFwiOlwiJChldGFnKVwiLFwiZnNpemVcIjokKGZzaXplKSxcIm1pbWVUeXBlXCI6XCIkKG1pbWVUeXBlKVwifSJ9'

/**
 * 上传文件到七牛云
 */
export async function uploadFile(file, key, onProgress) {
  return new Promise((resolve, reject) => {
    const putExtra = {
      fname: file.name,
      mimeType: file.type
    }
    const uploadConfig = {
      useCdnDomain: false,
      uphost: ['up.qiniup.com', 'upload.qiniup.com', 'up.qiniu.com', 'upload.qiniu.com']
    }

    const observable = qiniu.upload(file, key, UPLOAD_TOKEN, putExtra, uploadConfig)

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
 * 生成缩略图 URL
 */
export function getThumbnailUrl(key, width = 200, height = 200) {
  return `${config.cdnDomain}/${key}?imageView2/1/w/${width}/h/${height}`
}

/**
 * 上传分享数据
 */
export async function uploadShareData(shareId, data) {
  const jsonStr = JSON.stringify(data)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const key = config.sharePrefix + shareId + '.json'
  return await uploadFile(blob, key)
}

/**
 * 获取分享数据
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
 * 批量删除七牛云文件（静默失败，删除不需要提示用户）
 */
export async function batchDeleteFiles(keys) {
  if (!keys || keys.length === 0) return
  try {
    const resp = await fetch(config.workerUrl + '/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys })
    })
    if (!resp.ok) console.warn('删除失败:', resp.status)
    return await resp.json()
  } catch (e) {
    console.warn('删除API不可达（Worker可能需要翻墙）:', e.message)
    // 静默失败，不影响用户体验
  }
}

/**
 * 生成唯一 ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
