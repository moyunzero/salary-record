#!/bin/bash
# 部署 sync 云函数（需已安装微信开发者工具 CLI 并配置 installPath / envId）
installPath="${installPath:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"
envId="${envId:-YOUR_CLOUD_ENV_ID}"
projectPath="$(cd "$(dirname "$0")" && pwd)"

"${installPath}" cloud functions deploy --e "${envId}" --n sync --r --project "${projectPath}"
