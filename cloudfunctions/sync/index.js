const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function getOpenId() {
  const { OPENID, APPID } = cloud.getWXContext();
  if (!OPENID) return { error: 'NO_OPENID' };
  return { openid: OPENID, appid: APPID };
}

const COLLECTIONS = ['user_settings', 'clock_records'];

async function ensureCollections() {
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
    } catch (_) {}
  }
}

function isCollectionMissingError(err) {
  const msg = `${err?.errCode || ''} ${err?.message || ''} ${err?.errMsg || ''}`;
  return (
    msg.includes('-502005') ||
    /collection not exist|DATABASE_COLLECTION_NOT_EXIST|Db or Table not exist/i.test(msg)
  );
}

async function getDoc(name, OPENID) {
  try {
    const res = await db.collection(name).where({ _openid: OPENID }).limit(1).get();
    return res.data[0] || null;
  } catch (err) {
    if (isCollectionMissingError(err)) {
      await ensureCollections();
      return null;
    }
    throw err;
  }
}

async function pull(OPENID) {
  await ensureCollections();
  const [settingsDoc, recordsDoc] = await Promise.all([
    getDoc('user_settings', OPENID),
    getDoc('clock_records', OPENID),
  ]);
  return {
    settings: settingsDoc
      ? { payload: settingsDoc.payload, updatedAt: settingsDoc.updatedAt }
      : null,
    records: recordsDoc
      ? { payload: recordsDoc.payload, updatedAt: recordsDoc.updatedAt }
      : null,
  };
}

async function upsertCollection(name, OPENID, incoming) {
  if (!incoming || !incoming.payload) return false;
  try {
    const col = db.collection(name);
    const existing = await col.where({ _openid: OPENID }).limit(1).get();
    const doc = existing.data[0];
    if (doc && (incoming.updatedAt || 0) < (doc.updatedAt || 0)) {
      return false;
    }
    if (doc) {
      await col.doc(doc._id).update({
        data: { payload: incoming.payload, updatedAt: incoming.updatedAt },
      });
    } else {
      await col.add({
        data: { payload: incoming.payload, updatedAt: incoming.updatedAt },
      });
    }
    return true;
  } catch (err) {
    if (isCollectionMissingError(err)) {
      await ensureCollections();
      return upsertCollection(name, OPENID, incoming);
    }
    throw err;
  }
}

async function push(OPENID, event) {
  const accepted = {};
  if (event.settings) {
    accepted.settings = await upsertCollection('user_settings', OPENID, event.settings);
  }
  if (event.records) {
    accepted.records = await upsertCollection('clock_records', OPENID, event.records);
  }
  return { ok: true, accepted };
}

async function initCollections() {
  await ensureCollections();
  return { ok: true };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  if (action === 'getOpenId') {
    return getOpenId();
  }

  if (!OPENID) {
    return { error: 'NO_OPENID' };
  }

  if (action === 'pull') {
    return pull(OPENID);
  }

  if (action === 'push') {
    return push(OPENID, event);
  }

  if (action === 'init') {
    return initCollections();
  }

  return { error: 'UNKNOWN_ACTION' };
};
