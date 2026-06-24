#!/bin/bash
# 部署 sync 云函数（需已安装微信开发者工具 CLI 并配置 installPath / envId）
installPath="${installPath:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"
if [ -z "${envId}" ]; then
  echo "Usage: envId=your-cloud-env-id $0" >&2
  exit 1
fi
projectPath="$(cd "$(dirname "$0")" && pwd)"

"${installPath}" cloud functions deploy --e "${envId}" --n sync --r --project "${projectPath}"
