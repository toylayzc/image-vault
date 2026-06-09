/**
 * 生成七牛云上传 Token（本地运行，不要提交到前端）
 * 使用: node scripts/gen-token.js
 */
import { createHmac } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = join(__dirname, '..', 'qiniu-config.json')

// 读取配置
const config = JSON.parse(readFileSync(configPath, 'utf-8'))
const { accessKey, secretKey, bucket } = config

// 上传策略
const putPolicy = {
  scope: bucket,
  deadline: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 天有效期
  returnBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"mimeType":"$(mimeType)"}'
}

const encodedPutPolicy = Buffer.from(JSON.stringify(putPolicy)).toString('base64url')
const sign = createHmac('sha1', secretKey).update(encodedPutPolicy).digest('base64url')
const token = `${accessKey}:${sign}:${encodedPutPolicy}`

const outPath = join(__dirname, '..', 'src', 'token.txt')
writeFileSync(outPath, token, 'utf-8')
console.log('Token 已生成并保存到 src/token.txt')
console.log('有效期: 30 天')
