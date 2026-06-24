function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function filterCompleted(records) {
  return (records || []).filter(
    (r) => r.endTime && typeof r.earned === 'number'
  );
}

function sumByDate(records) {
  const map = {};
  for (const r of filterCompleted(records)) {
    map[r.date] = (map[r.date] || 0) + r.earned;
  }
  return map;
}

function bucketLast7Days(records, anchorDate = new Date()) {
  const categories = [];
  const data = [];
  const sums = sumByDate(records);

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - i);
    const key = dateStr(d);
    categories.push(`${pad2(d.getDate())}日`);
    data.push(Math.round((sums[key] || 0) * 100) / 100);
  }

  return { categories, data };
}

function bucketMonth(records, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const categories = [];
  const data = [];
  const sums = sumByDate(records);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad2(month)}-${pad2(day)}`;
    categories.push(String(day));
    data.push(Math.round((sums[key] || 0) * 100) / 100);
  }

  return { categories, data };
}

function bucketMonthByWeek(records, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const categories = [];
  const data = [];
  const sums = sumByDate(records);

  for (let start = 1; start <= daysInMonth; start += 7) {
    const end = Math.min(start + 6, daysInMonth);
    categories.push(start === end ? `${start}日` : `${start}-${end}日`);
    let sum = 0;
    for (let day = start; day <= end; day += 1) {
      const key = `${year}-${pad2(month)}-${pad2(day)}`;
      sum += sums[key] || 0;
    }
    data.push(Math.round(sum * 100) / 100);
  }

  return { categories, data };
}

/** 记录的标记类型：调休 > 节假日/休息日加班 > 普通工作日。 */
function markRecordKind(r) {
  if (r && r.compLeave) return 'comp';
  if (r && Number(r.premiumMultiplier) > 1) return 'premium';
  return 'work';
}

function markedDatesFromRecords(records) {
  return filterCompleted(records).map((r) => ({ date: r.date, kind: markRecordKind(r) }));
}

module.exports = {
  filterCompleted,
  sumByDate,
  bucketLast7Days,
  bucketMonth,
  bucketMonthByWeek,
  markRecordKind,
  markedDatesFromRecords,
};
