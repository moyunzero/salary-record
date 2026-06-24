const { PET_HABIT_PROFILE_KEY } = require('../constants/storage-keys');

const AFFINITY_LEVELS = ['low', 'mid', 'high'];
const NAP_CORNERS = ['left', 'center', 'right'];
const TOUCHINESS_LEVELS = ['low', 'mid', 'high'];
const GROOMER_LEVELS = ['low', 'mid', 'high'];
const DAY_MOODS = ['greedy', 'sleepy', 'playful'];

function todayKey(date) {
  const d = date instanceof Date ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickLevel(levels, seed) {
  return levels[Math.abs(seed) % levels.length];
}

function createPermanentFields(seed) {
  return {
    affinity: pickLevel(AFFINITY_LEVELS, seed),
    napCorner: pickLevel(NAP_CORNERS, seed + 1),
    groomer: pickLevel(GROOMER_LEVELS, seed + 2),
    touchiness: pickLevel(TOUCHINESS_LEVELS, seed + 3),
  };
}

function rollDayMood(seed, dayKey) {
  let h = seed;
  for (let i = 0; i < dayKey.length; i += 1) {
    h = (h * 31 + dayKey.charCodeAt(i)) | 0;
  }
  return DAY_MOODS[Math.abs(h) % DAY_MOODS.length];
}

function loadOrCreateProfile(now = new Date()) {
  const day = todayKey(now);
  let raw = wx.getStorageSync(PET_HABIT_PROFILE_KEY);

  if (!raw || typeof raw !== 'object' || !raw.v) {
    const seed = Math.floor(Math.random() * 1e9);
    raw = {
      v: 1,
      seed,
      ...createPermanentFields(seed),
      dayMood: rollDayMood(seed, day),
      dayKey: day,
    };
    wx.setStorageSync(PET_HABIT_PROFILE_KEY, raw);
    return raw;
  }

  if (raw.dayKey !== day) {
    raw.dayMood = rollDayMood(raw.seed, day);
    raw.dayKey = day;
    wx.setStorageSync(PET_HABIT_PROFILE_KEY, raw);
  }

  return raw;
}

function groomerWashBoost(groomer) {
  if (groomer === 'high') return 0.2;
  if (groomer === 'mid') return 0.1;
  return 0;
}

module.exports = {
  AFFINITY_LEVELS,
  NAP_CORNERS,
  TOUCHINESS_LEVELS,
  GROOMER_LEVELS,
  DAY_MOODS,
  todayKey,
  rollDayMood,
  createPermanentFields,
  loadOrCreateProfile,
  groomerWashBoost,
};
