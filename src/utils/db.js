import { openDB } from 'idb'

const DB_NAME = 'image-vault'
const DB_VERSION = 1

let db = null

export async function getDB() {
  if (db) return db
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // images store: key = auto-increment id, has unique hash index
      if (!db.objectStoreNames.contains('images')) {
        const store = db.createObjectStore('images', {
          keyPath: 'id',
          autoIncrement: true
        })
        store.createIndex('hash', 'hash', { unique: false })
        store.createIndex('groupIndex', 'groupIndex', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      // groups store
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', {
          keyPath: 'id',
          autoIncrement: true
        })
      }
      // settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', {
          keyPath: 'key'
        })
      }
    }
  })
  return db
}

// Add an image record
export async function addImage(blob, hash, filename) {
  const d = await getDB()
  const tx = d.transaction('images', 'readwrite')
  const store = tx.objectStore('images')
  const id = await store.add({
    blob,
    hash,
    filename,
    groupIndex: -1,
    timestamp: Date.now()
  })
  await tx.done
  return id
}

// Get all images
export async function getAllImages() {
  const d = await getDB()
  return d.getAll('images')
}

// Get image by ID
export async function getImage(id) {
  const d = await getDB()
  return d.get('images', id)
}

// Delete image
export async function deleteImage(id) {
  const d = await getDB()
  return d.delete('images', id)
}

// Get all hashes (for dedup check)
export async function getAllHashes() {
  const d = await getDB()
  const images = await d.getAll('images')
  return images.map(img => img.hash)
}

// Update image group
export async function updateImageGroup(id, groupIndex) {
  const d = await getDB()
  const tx = d.transaction('images', 'readwrite')
  const store = tx.objectStore('images')
  const img = await store.get(id)
  if (img) {
    img.groupIndex = groupIndex
    await store.put(img)
  }
  await tx.done
}

// Clear all images
export async function clearAllImages() {
  const d = await getDB()
  await d.clear('images')
}

// Setting helpers
export async function setSetting(key, value) {
  const d = await getDB()
  await d.put('settings', { key, value })
}

export async function getSetting(key) {
  const d = await getDB()
  const result = await d.get('settings', key)
  return result ? result.value : null
}
