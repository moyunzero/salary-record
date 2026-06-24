function mergeSettings(local, localUpdatedAt, cloud, cloudUpdatedAt) {
  if (!cloud) return local;
  if (!local) return cloud;
  return (localUpdatedAt || 0) >= (cloudUpdatedAt || 0) ? local : cloud;
}

function mergeAllRecords(localArr, cloudArr) {
  const byId = new Map();

  function consider(record) {
    if (!record || !record.id) return;
    const prev = byId.get(record.id);
    if (!prev || (record.updatedAt || 0) >= (prev.updatedAt || 0)) {
      byId.set(record.id, record);
    }
  }

  (localArr || []).forEach(consider);
  (cloudArr || []).forEach(consider);
  return Array.from(byId.values());
}

function mergeRecords(localArr, cloudArr) {
  return mergeAllRecords(localArr, cloudArr).filter((r) => !r.deleted);
}

function maxRecordUpdatedAt(records) {
  if (!records || !records.length) return 0;
  return records.reduce((max, r) => Math.max(max, r.updatedAt || 0), 0);
}

module.exports = {
  mergeSettings,
  mergeRecords,
  mergeAllRecords,
  maxRecordUpdatedAt,
};
