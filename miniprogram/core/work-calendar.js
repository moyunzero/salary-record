// 工作日历内核：把「某天是什么日」统一解析为 dayType，并支持
// 双休 / 单休 / 大小周 / 自定义 四种工作制，以及法定节假日 + 调休补班。
//
// dayType:
//   'workday'           正常工作日（自动开始、月薪摊计薪、超时稀释）
//   'makeup_workday'    调休补班日（官方把周末调成工作日，按工作日处理）
//   'weekly_rest'       每周休息日（双休的周末 / 单休的周日等）
//   'statutory_holiday' 法定节假日（默认休息，可选上班 3× 或调休）

const DAY_TYPE = {
  WORKDAY: 'workday',
  MAKEUP_WORKDAY: 'makeup_workday',
  WEEKLY_REST: 'weekly_rest',
  STATUTORY_HOLIDAY: 'statutory_holiday',
};

const REST_SYSTEM = {
  DOUBLE: 'double_rest',
  SINGLE: 'single_rest',
  BIG_SMALL: 'big_small_week',
  CUSTOM: 'custom',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 接受 'YYYY-MM-DD' 字符串或 Date，统一返回本地零点 Date。 */
function toDate(input) {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const [y, m, d] = String(input).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 稳定的「周序号」：取所在周的周一本地零点，按周长取整。
 * 相邻周差恰为 1，可用于大小周奇偶判定（不依赖绝对值，只看差）。
 * @param {Date|string} input
 * @returns {number}
 */
function isoWeekIndex(input) {
  const d = toDate(input);
  const dow = d.getDay(); // 0=周日 … 6=周六
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  return Math.round(monday.getTime() / WEEK_MS);
}

/** 大周（含周六）/ 小周（仅周一~五）判定。缺省锚点按大周处理。 */
function isBigWeek(input, settings) {
  const bs = (settings && settings.bigSmall) || {};
  const anchorType = bs.anchorType === 'small' ? 'small' : 'big';
  if (!bs.anchorWeekDate) return true;
  const anchor = toDate(bs.anchorWeekDate);
  if (Number.isNaN(anchor.getTime())) return true;
  const diff = isoWeekIndex(input) - isoWeekIndex(anchor);
  const sameParity = (((diff % 2) + 2) % 2) === 0;
  return sameParity ? anchorType === 'big' : anchorType !== 'big';
}

function weeklyWorkdaysFor(restSystem) {
  if (restSystem === REST_SYSTEM.SINGLE) return [1, 2, 3, 4, 5, 6];
  return [1, 2, 3, 4, 5];
}

/**
 * 仅按「每周工作制」判断是否工作日（不含法定节假日覆盖）。
 * @param {Date|string} input
 * @param {object} settings
 * @returns {boolean}
 */
function isWeeklyWorkday(input, settings) {
  const date = toDate(input);
  const dow = date.getDay();
  const sys = (settings && settings.restSystem) || REST_SYSTEM.DOUBLE;

  if (sys === REST_SYSTEM.CUSTOM) {
    const wd = Array.isArray(settings.workWeekdays) ? settings.workWeekdays : [1, 2, 3, 4, 5];
    return wd.includes(dow);
  }
  if (sys === REST_SYSTEM.BIG_SMALL) {
    if (dow === 0) return false; // 周日恒休
    if (dow >= 1 && dow <= 5) return true; // 周一~五恒上
    return isBigWeek(date, settings); // 周六：大周上、小周休
  }
  return weeklyWorkdaysFor(sys).includes(dow);
}

/**
 * 解析某天的 dayType。法定节假日数据优先覆盖每周作息；
 * 关闭「节假日自动休息」后忽略整个节假日表，回退到纯每周作息。
 * @param {Date|string} input
 * @param {object} settings
 * @param {Object<string,{type:string,name:string}>} holidayMap
 * @returns {string} DAY_TYPE.*
 */
function resolveDayType(input, settings, holidayMap) {
  const date = toDate(input);
  const autoRest = !settings || settings.holidayAutoRest !== false;
  if (autoRest && holidayMap) {
    const h = holidayMap[dateKey(date)];
    if (h && h.type === 'public_holiday') return DAY_TYPE.STATUTORY_HOLIDAY;
    if (h && h.type === 'transfer_workday') return DAY_TYPE.MAKEUP_WORKDAY;
  }
  return isWeeklyWorkday(date, settings) ? DAY_TYPE.WORKDAY : DAY_TYPE.WEEKLY_REST;
}

/** 是否按工作日处理（自动开始、正常计薪）。 */
function isWorkingDayType(dayType) {
  return dayType === DAY_TYPE.WORKDAY || dayType === DAY_TYPE.MAKEUP_WORKDAY;
}

/** 节假日/休息日上班的工资倍数：法定节假日 3×、休息日 2×、其余 1×。 */
function premiumMultiplierFor(dayType) {
  if (dayType === DAY_TYPE.STATUTORY_HOLIDAY) return 3;
  if (dayType === DAY_TYPE.WEEKLY_REST) return 2;
  return 1;
}

module.exports = {
  DAY_TYPE,
  REST_SYSTEM,
  dateKey,
  toDate,
  isoWeekIndex,
  isBigWeek,
  isWeeklyWorkday,
  resolveDayType,
  isWorkingDayType,
  premiumMultiplierFor,
};
