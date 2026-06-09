/**
 * Cloudflare Worker - 七牛云上传凭证 + 删除 API
 *
 * 部署方法：
 * 1. 在 Cloudflare Dashboard 创建 Worker
 * 2. 把此代码粘贴进去
 * 3. 在 Worker 设置中配置环境变量:
 *    - QINIU_ACCESS_KEY
 *    - QINIU_SECRET_KEY
 *    - QINIU_BUCKET
 * 4. 部署后拿到 Worker URL (如 https://qiniu-helper.xxx.workers.dev)
 * 5. 更新前端 src/config.js 中的 WORKER_URL
 */

// Qiniu API endpoints
const QINIU_RS_HOST = 'https://rs.qiniu.com'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      if (path === '/upload-token' && request.method === 'POST') {
        return await handleUploadToken(request, env, corsHeaders)
      }
      if (path === '/delete' && request.method === 'POST') {
        return await handleDelete(request, env, corsHeaders)
      }
      if (path === '/batch-delete' && request.method === 'POST') {
        return await handleBatchDelete(request, env, corsHeaders)
      }
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
}

/**
 * 生成 Qiniu 上传凭证
 */
async function handleUploadToken(request, env, corsHeaders) {
  const { accessKey, secretKey, bucket } = env

  const putPolicy = {
    scope: bucket,
    deadline: Math.floor(Date.now() / 1000) + 3600, // 1 小时有效
    returnBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize)}'
  }

  const token = await generateQiniuToken(putPolicy, accessKey, secretKey)

  return new Response(JSON.stringify({ token, keyPrefix: 'photos/' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/**
 * 批量删除七牛云文件
 * Body: { keys: ["photos/xxx.jpg", ...] }
 */
async function handleBatchDelete(request, env, corsHeaders) {
  const { keys } = await request.json()
  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return new Response(JSON.stringify({ error: 'keys required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const { accessKey, secretKey, bucket } = env

  // batch delete API: POST /delete/<encodedBucket>
  const encodedBucket = base64UrlSafe(bucket)
  const deleteOps = keys.map(key => ({
    op: 'delete/' + base64UrlSafe(`${bucket}:${key}`)
  }))

  const body = JSON.stringify({ ops: deleteOps })
  const encodedPath = '/batch/' + encodedBucket
  const sign = await signQiniuRequest('POST', encodedPath, body, accessKey, secretKey)

  const resp = await fetch(`${QINIU_RS_HOST}${encodedPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `QBox ${sign}`
    },
    body
  })

  const result = await resp.json()
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

/**
 * 单个删除（保留兼容）
 */
async function handleDelete(request, env, corsHeaders) {
  const { key } = await request.json()
  return await handleBatchDelete(request, env, {
    ...corsHeaders,
    body: JSON.stringify({ keys: [key] })
  })
}

// ====== Qiniu Auth Helpers ======

async function generateQiniuToken(putPolicy, accessKey, secretKey) {
  const encodedPutPolicy = base64UrlSafe(JSON.stringify(putPolicy))
  const sign = await hmacSha1(secretKey, encodedPutPolicy)
  return `${accessKey}:${sign}:${encodedPutPolicy}`
}

async function signQiniuRequest(method, path, body, accessKey, secretKey) {
  const url = path + '\n' + (body || '')
  const sign = await hmacSha1(secretKey, url)
  return `${accessKey}:${sign}`
}

async function hmacSha1(secretKey, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlSafe(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
