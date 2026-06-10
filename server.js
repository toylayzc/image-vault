const express = require('express')
const cors = require('cors')
const qiniu = require('qiniu')

const app = express()
const PORT = 3000

const accessKey = 'ok1FbdAJHr53s-_FRRnS2p3srnEh7q4PmydlgrQl'
const secretKey = 'BgfRq5_i4EwEmXIpAXY6Yd0nuuSE4HO6HZjE5RZo'
const bucket = 'image-vault-es'

app.use(cors({
  origin: ['https://toylayzc.github.io', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}))

app.use(express.json({ limit: '1mb' }))

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Image Vault API running' })
})

app.post('/upload-token', (req, res) => {
  try {
    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
    const options = { scope: bucket, expires: 3600 }
    const putPolicy = new qiniu.rs.PutPolicy(options)
    const token = putPolicy.uploadToken(mac)
    res.json({ token, keyPrefix: 'photos/' })
  } catch (e) {
    console.error('Token error:', e)
    res.status(500).json({ error: e.message })
  }
})

app.post('/batch-delete', (req, res) => {
  try {
    const { keys } = req.body
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'keys required' })
    }
    const mac = new qiniu.auth.digest.Mac(accessKey, secretKey)
    const config = new qiniu.conf.Config()
    config.zone = qiniu.zone.Zone_z0
    const bucketManager = new qiniu.rs.BucketManager(mac, config)
    const deleteOps = keys.map(key => qiniu.rs.deleteOp(bucket, key))
    bucketManager.batch(deleteOps, (err, respBody, respInfo) => {
      if (err) return res.status(500).json({ error: err.message })
      res.json({ success: true, deleted: keys.length })
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log('API server running on port ' + PORT)
})
