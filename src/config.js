/**
 * 应用配置
 */
const config = {
  // 图片存储路径前缀（服务器本地）
  photoPrefix: '',
  sharePrefix: 'shares/', // 分享数据存在 /uploads/shares/ 下，通过 API 访问

  // 自动删除：下载完成后保留天数
  retainDays: 3
}

export default config
