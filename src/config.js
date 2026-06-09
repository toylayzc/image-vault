/**
 * 应用配置
 * 部署前请修改为自己的配置
 */
const config = {
  // Cloudflare Worker URL（用于获取上传凭证 + 删除文件）
  // 部署 Worker 后替换为你的 Worker 地址
  workerUrl: 'https://qiniu-helper.your-username.workers.dev',

  // 七牛云 Bucket 的公共访问域名（测试域名在 Bucket → 域名管理 里可以找到）
  // 格式如: https://s3.cn-east-1.qiniucdn.com 或 https://xxx.xxx.clouddn.com
  cdnDomain: 'https://s3.cn-east-1.qiniucdn.com',

  // 图片存储路径前缀
  photoPrefix: 'photos/',
  sharePrefix: 'shares/',

  // 自动删除：下载完成后保留天数
  retainDays: 3
}

export default config
