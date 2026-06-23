---
phase: 5
slug: cloud-sync
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-23
---

# Phase 5 — Security（Cloud Sync）

> 云同步阶段威胁登记、已接受风险与审计记录。

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| openId → AES key | 客户端内存派生密钥，不持久化 | openId + APP_SALT → AES passphrase |
| Client → cloud function | 仅传输密文 + updatedAt | AES 加密 settings/records |
| Cloud function → database | 按 `_openid` 隔离读写 | 密文 blob；服务端不解密 |
| sync.js → wx.storage | pull 解密后写入本地 | 解密后的 settings/records |
| Profile → sync.js | 用户显式 opt-in | cloudSyncEnabled 开关 + 确认弹窗 |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Information disclosure | sync-crypto.js | mitigate | `deriveKey` 仅内存使用；`settingsForSync` 剥离 `cloudSyncEnabled`/`updatedAt` | closed |
| T-05-02 | Tampering | sync-merge.js | mitigate | LWW `updatedAt`；`mergeRecords` 过滤 `deleted`；tombstone 软删 | closed |
| T-05-03 | Tampering | crypto-js | mitigate | `miniprogram/package.json` 固定 `3.3.0`；使用官方 AES API | closed |
| T-05-SC-1 | Tampering | crypto-js install | mitigate | 版本锁定 + vendor 内置 bundle | closed |
| T-05-04 | Spoofing | cloudfunctions/sync | mitigate | `OPENID` 仅来自 `cloud.getWXContext()`；无 OPENID 返回 error | closed |
| T-05-05 | Information disclosure | user_settings / clock_records | mitigate | README 要求 `doc._openid == auth.openid`；客户端 AES 加密 payload | closed |
| T-05-06 | Tampering | push handler | mitigate | `upsertCollection` 拒绝 `incoming.updatedAt < doc.updatedAt` | closed |
| T-05-SC-2 | Tampering | wx-server-sdk | accept | 官方包 `~2.4.0`；信任微信 npm 源 | closed |
| T-05-07 | Information disclosure | sync.js session | mitigate | `_sessionOpenId` 模块变量；`logoutCloudSession`/`clearSessionOpenId` 清除 | closed |
| T-05-08 | Tampering | merge + push | mitigate | 客户端 merge LWW + 服务端 updatedAt gate 双重保护 | closed |
| T-05-09 | Denial of service | withRetry | accept | 静默 3 次退避重试；失败不影响本地打卡（D-11） | closed |
| T-05-10 | Information disclosure | enable modal | mitigate | 弹窗说明 AES 加密 + 仅本人可解密（D-04） | closed |
| T-05-11 | Elevation | Profile toggle | mitigate | 开启/关闭/退出均需 `wx.showModal` 确认后才调用 sync API | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-09 | 云同步失败静默重试，不阻塞本地功能；符合产品 D-11 | gsd-security-audit | 2026-06-23 |
| AR-05-02 | T-05-SC-2 | wx-server-sdk 为微信官方运行时依赖，版本 ~2.4.0 | gsd-security-audit | 2026-06-23 |
| AR-05-03 | T-05-05 (partial) | 云数据库安全规则需在 CloudBase 控制台人工配置；代码与 README 已文档化 | gsd-security-audit | 2026-06-23 |

---

## Verification Evidence

| Threat | Evidence |
|--------|----------|
| T-05-01 | `miniprogram/core/sync-crypto.js` L8–10 `settingsForSync`；无 storage 写 key |
| T-05-02 | `sync-merge.js` L1–25；`clock.js` tombstone L262–268 |
| T-05-03/SC-1 | `miniprogram/package.json` `"crypto-js": "3.3.0"` |
| T-05-04/06 | `cloudfunctions/sync/index.js` L105–114, L66–67 |
| T-05-05 | `README.md` L42 安全规则；push/pull 仅存 `payload` 密文 |
| T-05-07 | `sync.js` L11–24, L236–239 |
| T-05-08 | `sync.js` merge + push；`sync/index.js` upsert gate |
| T-05-09 | `sync.js` L40–51 `withRetry`；离线 `isOnline()` 静默跳过 |
| T-05-10/11 | `profile/index.js` L68–71 enable modal；L95–108 disable modal |

**Automated tests:** `npm run test:core` — sync-crypto, sync-merge, sync, enable-cloud-sync 全通过  
**Human UAT:** `05-UAT.md` — 7/7 pass (2026-06-23)

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-23 | 13 | 13 | 0 | gsd-secure-phase / inline verification |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-23
