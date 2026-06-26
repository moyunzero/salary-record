const CAT_ATLAS = require('../../assets/cat-pet/cat1-atlas-data.js');

const SCENARIOS = [
  { id: 'beforeWork', label: '上班前', scene: 'beforeWork', escalation: 0, appState: 'idle' },
  { id: 'offDuty', label: '闲暇', scene: 'offDuty', escalation: 0, appState: 'idle' },
  { id: 'onShift', label: '上班中', scene: 'onShift', escalation: 0, appState: 'working' },
  { id: 'lunch', label: '午休', scene: 'lunch', escalation: 0, appState: 'idle' },
  { id: 'dinner', label: '晚休', scene: 'dinner', escalation: 0, appState: 'idle' },
  { id: 'nightShift', label: '晚班', scene: 'nightShift', escalation: 0, appState: 'working' },
  { id: 'otL1', label: '自愿卷 L1', scene: 'overtime', escalation: 1, appState: 'working' },
  { id: 'otL2', label: '自愿卷 L2', scene: 'overtime', escalation: 2, appState: 'working' },
  { id: 'otL3', label: '自愿卷 L3', scene: 'overtime', escalation: 3, appState: 'working' },
  { id: 'otL4', label: '自愿卷 L4', scene: 'overtime', escalation: 4, appState: 'working' },
  { id: 'doneActive', label: '收工·傍晚', scene: 'done', escalation: 0, appState: 'done', doneBand: 'done-active' },
  { id: 'doneNight', label: '收工·深夜', scene: 'done', escalation: 0, appState: 'done', doneBand: 'done-night' },
];

const SLEEP_CLIPS = [
  { clip: 'sleep1_l', label: 'sleep1 · 左' },
  { clip: 'sleep1_r', label: 'sleep1 · 右' },
  { clip: 'sleep2_l', label: 'sleep2 · 左' },
  { clip: 'sleep2_r', label: 'sleep2 · 右' },
  { clip: 'sleep3_l', label: 'sleep3 · 左' },
  { clip: 'sleep3_r', label: 'sleep3 · 右' },
  { clip: 'sleep4_l', label: 'sleep4 · 左' },
  { clip: 'sleep4_r', label: 'sleep4 · 右' },
];

const MEOW_CLIPS = [
  { clip: 'meow_sit', label: 'meow · 坐' },
  { clip: 'meow_stand', label: 'meow · 站' },
  { clip: 'meow_sit2', label: 'meow · 坐2' },
  { clip: 'meow_lie', label: 'meow · 趴' },
];

const YAWN_CLIPS = [
  { clip: 'yawn_sit', label: 'yawn · 坐' },
  { clip: 'yawn_stand', label: 'yawn · 站' },
  { clip: 'yawn_sit2', label: 'yawn · 坐2' },
  { clip: 'yawn_lie', label: 'yawn · 趴' },
];

const WASH_CLIPS = [
  { clip: 'wash_sit', label: 'wash · 坐（9帧）' },
  { clip: 'wash_stand', label: 'wash · 站（9帧）' },
  { clip: 'wash_lie', label: 'wash · 趴（7帧）' },
];

const SCRATCH_CLIPS = [
  { clip: 'scratch_l', label: 'scratch · 左（11帧）' },
  { clip: 'scratch_r', label: 'scratch · 右（11帧）' },
];

const HISS_CLIPS = [
  { clip: 'hiss_l', label: 'hiss · 左（2帧）' },
  { clip: 'hiss_r', label: 'hiss · 右（2帧）' },
];

const IDLE_CLIPS = [
  { clip: 'idle_a', label: 'idle · 33,35' },
  { clip: 'idle_b', label: 'idle · 34,36' },
];

const PAW_CLIPS = [
  { clip: 'paw_attack_down', label: 'paw · 下（9帧）' },
  { clip: 'paw_attack_up', label: 'paw · 上（5帧）' },
  { clip: 'paw_attack_left', label: 'paw · 左（7帧）' },
  { clip: 'paw_attack_right', label: 'paw · 右（7帧）' },
  { clip: 'paw_attack_left_down', label: 'paw · 左下（9帧）' },
  { clip: 'paw_attack_right_down', label: 'paw · 右下（9帧）' },
  { clip: 'paw_attack_left_up', label: 'paw · 左上（5帧）' },
  { clip: 'paw_attack_right_up', label: 'paw · 右上（5帧）' },
];

const GROUPED_CLIP_IDS = new Set([
  ...SLEEP_CLIPS.map((item) => item.clip),
  ...MEOW_CLIPS.map((item) => item.clip),
  ...YAWN_CLIPS.map((item) => item.clip),
  ...WASH_CLIPS.map((item) => item.clip),
  ...SCRATCH_CLIPS.map((item) => item.clip),
  ...HISS_CLIPS.map((item) => item.clip),
  ...IDLE_CLIPS.map((item) => item.clip),
  ...PAW_CLIPS.map((item) => item.clip),
]);

const ALL_CLIPS = Object.keys(CAT_ATLAS.clips || {})
  .filter((key) => !GROUPED_CLIP_IDS.has(key))
  .sort();

Component({
  properties: {
    enabled: { type: Boolean, value: false },
    open: { type: Boolean, value: false },
    statusBarHeight: { type: Number, value: 0 },
    panelBottom: { type: Number, value: 200 },
    petDockTop: { type: Number, value: 400 },
    petDockHeight: { type: Number, value: 0 },
    petDockBottom: { type: Number, value: 5 },
    liveContext: { type: String, value: 'beforeWork' },
    liveEscalation: { type: Number, value: 0 },
    debugInfo: { type: Object, value: {} },
    active: { type: Boolean, value: false },
    scenarioId: { type: String, value: '' },
    scene: { type: String, value: 'beforeWork' },
    escalation: { type: Number, value: 0 },
    appState: { type: String, value: 'idle' },
    doneBand: { type: String, value: '' },
    forceClip: { type: String, value: '' },
  },

  data: {
    scenarios: SCENARIOS,
    sleepClips: SLEEP_CLIPS,
    meowClips: MEOW_CLIPS,
    yawnClips: YAWN_CLIPS,
    washClips: WASH_CLIPS,
    scratchClips: SCRATCH_CLIPS,
    hissClips: HISS_CLIPS,
    idleClips: IDLE_CLIPS,
    pawClips: PAW_CLIPS,
    allClips: ALL_CLIPS,
  },

  methods: {
    toggle() {
      if (!this.properties.enabled) return;
      this.triggerEvent('openchange', { open: !this.properties.open });
    },

    onClose() {
      this.triggerEvent('openchange', { open: false });
    },

    noop() {},

    onSelectScenario(e) {
      const { id } = e.currentTarget.dataset;
      const scenario = SCENARIOS.find((s) => s.id === id);
      if (!scenario) return;
      this.triggerEvent('override', {
        active: true,
        scenarioId: scenario.id,
        scene: scenario.scene,
        escalation: scenario.escalation,
        appState: scenario.appState,
        doneBand: scenario.doneBand || '',
        forceClip: '',
        triggerRoam: true,
      });
      this.triggerEvent('openchange', { open: true });
    },

    onSelectClip(e) {
      const { clip } = e.currentTarget.dataset;
      if (!clip) return;
      this.triggerEvent('override', {
        active: true,
        scenarioId: '',
        forceClip: clip,
      });
      this.triggerEvent('openchange', { open: true });
    },

    onTriggerRoam() {
      this.triggerEvent('action', { type: 'roam' });
    },

    onSimulateTap() {
      this.triggerEvent('action', { type: 'tap' });
    },

    onInjectPatrol() {
      this.triggerEvent('action', { type: 'patrol' });
    },

    onReset() {
      this.triggerEvent('override', {
        active: false,
        scenarioId: '',
        forceClip: '',
        scene: 'beforeWork',
        escalation: 0,
        appState: 'idle',
        doneBand: '',
      });
    },
  },
});
