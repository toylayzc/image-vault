/**
 * Perceptual hash (dHash) for image deduplication.
 * Uses difference hashing: resize to 9x8, grayscale, compare adjacent pixels.
 * Returns a 64-bit hex string.
 */

function grayscale(pixels, width, height) {
  const gray = []
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const idx = (i * width + j) * 4
      // luminance weights: 0.299 R + 0.587 G + 0.114 B
      const g = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]
      gray.push(g)
    }
  }
  return gray
}

function dHashFromGray(gray, width, height) {
  let hash = ''
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width - 1; j++) {
      const idx = i * width + j
      hash += gray[idx] > gray[idx + 1] ? '1' : '0'
    }
  }
  return hash
}

/**
 * Compute dHash of an image Blob/File
 * Returns a 64-char binary string
 */
export async function computeHash(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const W = 9, H = 8
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, W, H)
      const imageData = ctx.getImageData(0, 0, W, H)
      const gray = grayscale(imageData.data, W, H)
      const hash = dHashFromGray(gray, W, H)
      URL.revokeObjectURL(url)
      resolve(hash)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

/**
 * Compute Hamming distance between two binary hash strings
 */
export function hammingDistance(hash1, hash2) {
  let dist = 0
  const len = Math.min(hash1.length, hash2.length)
  for (let i = 0; i < len; i++) {
    if (hash1[i] !== hash2[i]) dist++
  }
  // add remaining bits as differences
  dist += Math.abs(hash1.length - hash2.length)
  return dist
}

/**
 * Check if a hash is a duplicate (within threshold)
 * @param {string} newHash - binary string hash
 * @param {string[]} existingHashes - array of binary string hashes
 * @param {number} threshold - max Hamming distance (default 10)
 * @returns {{ isDuplicate: boolean, distance: number }}
 */
export function isDuplicate(newHash, existingHashes, threshold = 10) {
  for (const hash of existingHashes) {
    const dist = hammingDistance(newHash, hash)
    if (dist <= threshold) {
      return { isDuplicate: true, distance: dist }
    }
  }
  return { isDuplicate: false, distance: Infinity }
}
