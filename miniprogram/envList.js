/** 云环境列表。真实 ID 请写在 envList.local.js（见 envList.example.js） */
let envList = [{ envId: '', alias: 'cloud1' }];

try {
  const local = require('./envList.local');
  if (local && Array.isArray(local.envList) && local.envList.length) {
    envList = local.envList;
  }
} catch (_) {
  /* envList.local.js 不存在时使用空 envId，云能力需自行配置 */
}

module.exports = { envList };
