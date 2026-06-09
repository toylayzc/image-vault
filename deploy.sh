#!/usr/bin/env bash
# Gitee Pages 部署脚本
# 使用方式：
#   1. 修改下方 GITEE_REPO 为你的仓库名
#   2. 运行 bash deploy.sh
#
# 此脚本会构建项目并将 dist/ 推送到 pages 分支

set -e

GITEE_REPO="你的Gitee仓库名"  # 例如：username/image-vault
BRANCH="pages"

echo "=== 构建项目 ==="
npm run build

echo "=== 部署到 Gitee Pages ($BRANCH 分支) ==="
cd dist

git init
git checkout -b $BRANCH
git add -A
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"

echo "=== 推送到远程仓库 ==="
git remote add origin "https://gitee.com/${GITEE_REPO}.git"
git push -f origin $BRANCH

echo "=== 部署成功！ ==="
echo "请在 Gitee 仓库设置中开启 Pages 服务，选择 $BRANCH 分支"
