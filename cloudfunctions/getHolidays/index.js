// 节假日数据代理：拉取开源 holiday-calendar（CDN），归一化为
// { 'YYYY-MM-DD': { type: 'public_holiday' | 'transfer_workday', name } } 返回客户端缓存。
// 不依赖第三方包，仅用 Node 内置 https。

const https = require('https');

const SOURCES = [
  (year) => `https://unpkg.com/holiday-calendar/data/CN/${year}.json`,
  (year) => `https://gcore.jsdelivr.net/gh/cg-zhou/holiday-calendar@main/data/CN/${year}.json`,
];

function fetchJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP_${res.statusCode}`));
        return;
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error('PARSE_ERROR'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('TIMEOUT'));
    });
  });
}

function normalize(raw) {
  const map = {};
  const dates = (raw && raw.dates) || [];
  for (const d of dates) {
    if (!d || !d.date || !d.type) continue;
    map[d.date] = { type: d.type, name: d.name_cn || d.name || '' };
  }
  return map;
}

exports.main = async (event) => {
  const year = Number(event && event.year) || new Date().getFullYear();
  let lastErr = null;
  for (const build of SOURCES) {
    try {
      const raw = await fetchJson(build(year));
      const map = normalize(raw);
      if (Object.keys(map).length > 0) {
        return { ok: true, year, map };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  return { ok: false, year, error: (lastErr && lastErr.message) || 'NO_DATA' };
};
