/**
 * Fisher-Yates shuffle
 */
export function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Auto-group images
 * @param {Array} images - array of image objects
 * @param {number} groupSize - number of images per group
 * @param {boolean} doShuffle - whether to shuffle before grouping
 * @returns {Array<Array>} array of groups, each an array of image objects
 */
export function autoGroup(images, groupSize, doShuffle = true) {
  if (!images.length || groupSize <= 0) return []
  const working = doShuffle ? shuffle(images) : [...images]
  const groups = []
  for (let i = 0; i < working.length; i += groupSize) {
    groups.push(working.slice(i, i + groupSize))
  }
  return groups
}
