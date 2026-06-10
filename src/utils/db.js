/**
 * IndexedDB 存储层
 * 存储图片元数据、分组信息、分享记录
 * 图片本体存储在七牛云
 */
import { openDB } from 'idb'

const DB_NAME = 'image-vault-meta'
const DB_VERSION = 2

let db = null

export async function getDB() {
  if (db) return db
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // images store: metadata only
      if (!db.objectStoreNames.contains('images')) {
        const store = db.createObjectStore('images', {
          keyPath: 'id',
          autoIncrement: true
        })
        store.createIndex('hash', 'hash', { unique: false })
        store.createIndex('groupIndex', 'groupIndex', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('downloaded', 'downloaded', { unique: false })
      }
      // shares store: share records
      if (!db.objectStoreNames.contains('shares')) {
        const store = db.createObjectStore('shares', {
          keyPath: 'shareId'
        })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      // settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
    }
  })
  return db
}

// ====== Image Metadata CRUD ======

/**
 * 添加图片元数据记录
 */
export async function addImageMeta({ qiniuKey, qiniuUrl, hash, filename, groupIndex = -1 }) {
  const d = await getDB()
  const id = await d.add('images', {
    qiniuKey,
    qiniuUrl,
    hash,
    filename,
    groupIndex,
    timestamp: Date.now(),
    downloaded: false
  })
  return id
}

/**
 * 获取所有图片元数据
 */
export async function getAllImages() {
  const d = await getDB()
  return d.getAll('images')
}

/**
 * 按组索引获取图片
 */
export async function getImagesByGroup(groupIndex) {
  const d = await getDB()
  const all = await d.getAll('images')
  return all.filter(img => img.groupIndex === groupIndex)
}

/**
 * 更新分组索引
 */
export async function updateImageGroup(id, groupIndex) {
  const d = await getDB()
  const img = await d.get('images', id)
  if (img) {
    img.groupIndex = groupIndex
    await d.put('images', img)
  }
}

/**
 * 标记已下载
 */
export async function markDownloaded(id) {
  const d = await getDB()
  const img = await d.get('images', id)
  if (img) {
    img.downloaded = true
    img.downloadedAt = Date.now()
    await d.put('images', img)
  }
}

/**
 * 批量标记已下载
 */
export async function markGroupDownloaded(groupIndex) {
  const images = await getImagesByGroup(groupIndex)
  for (const img of images) {
    await markDownloaded(img.id)
  }
}

/**
 * 删除图片元数据
 */
export async function deleteImage(id) {
  const d = await getDB()
  await d.delete('images', id)
}

/**
 * 清除所有图片
 */
export async function clearAllImages() {
  const d = await getDB()
  await d.clear('images')
}

/**
 * 获取所有 hash（用于去重）
 */
export async function getAllHashes() {
  const d = await getDB()
  const images = await d.getAll('images')
  return images.map(img => img.hash)
}

/**
 * 获取所有已存储的文件名（用于文件名去重）
 */
export async function getAllFilenames() {
  const d = await getDB()
  const images = await d.getAll('images')
  return images.map(img => img.filename).filter(Boolean)
}

/**
 * 获取已下载但未清理的图片（超过 retainDays）
 */
export async function getExpiredDownloadedImages(retainDays = 3) {
  const d = await getDB()
  const all = await d.getAll('images')
  const now = Date.now()
  const maxAge = retainDays * 24 * 60 * 60 * 1000
  return all.filter(img => img.downloaded && img.downloadedAt && (now - img.downloadedAt > maxAge))
}

/**
 * 按分组删除所有图片的元数据
 */
export async function deleteImagesByGroup(groupIndex) {
  const d = await getDB()
  const all = await d.getAll('images')
  const tx = d.transaction('images', 'readwrite')
  for (const img of all) {
    if (img.groupIndex === groupIndex) {
      await tx.store.delete(img.id)
    }
  }
  await tx.done
}

/**
 * 清除所有分组索引（重置）
 */
export async function resetAllGroups() {
  const d = await getDB()
  const all = await d.getAll('images')
  const tx = d.transaction('images', 'readwrite')
  for (const img of all) {
    img.groupIndex = -1
    await tx.store.put(img)
  }
  await tx.done
}

// ====== Shares ======

/**
 * 创建分享记录
 */
export async function createShare(shareId, groupIndex, groupData) {
  const d = await getDB()
  await d.add('shares', {
    shareId,
    groupIndex,
    imageCount: groupData.images.length,
    createdAt: Date.now(),
    ...groupData
  })
}

/**
 * 获取所有分享记录
 */
export async function getAllShares() {
  const d = await getDB()
  return d.getAll('shares')
}

/**
 * 删除分享记录
 */
export async function deleteShare(shareId) {
  const d = await getDB()
  await d.delete('shares', shareId)
}

/**
 * 获取过期的分享（超过 retainDays）
 */
export async function getExpiredShares(retainDays = 3) {
  const d = await getDB()
  const all = await d.getAll('shares')
  const now = Date.now()
  const maxAge = retainDays * 24 * 60 * 60 * 1000
  return all.filter(s => now - s.createdAt > maxAge)
}

// ====== Settings ======

export async function setSetting(key, value) {
  const d = await getDB()
  await d.put('settings', { key, value })
}

export async function getSetting(key) {
  const d = await getDB()
  const result = await d.get('settings', key)
  return result ? result.value : null
}

export async function getStorageStats() {
  const all = await getAllImages()
  let totalSize = 0
  let downloaded = 0
  for (const img of all) {
    totalSize++
    if (img.downloaded) downloaded++
  }
  return {
    total: all.length,
    downloaded,
    notDownloaded: all.length - downloaded
  }
}
