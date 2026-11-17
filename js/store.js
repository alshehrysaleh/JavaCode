// تخزين محلي بسيط على الجهاز (localStorage)
const KEY = 'gymapp.v1';

const DEFAULTS = () => ({
  plans: [],      // {id, name, muscles[], exercises:[{exId, sets, reps}], createdAt, updatedAt}
  sessions: [],   // {id, planId, name, muscles[], date, durationSec, entries:[{exId, sets:[{w, r, done}]}]}
  schedule: [],   // {date:'YYYY-MM-DD', planId}
  favorites: [],  // معرّفات التمارين المفضلة
  weekly: [],     // برنامج أسبوعي ثابت: {dow: 0..6 (الأحد=0), planId, from:'YYYY-MM-DD'}
  settings: { unit: 'kg', rest: 90, gif: true, defaultSets: 3, defaultReps: 10, view: 'grid', showAdvanced: false },
});

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const s = JSON.parse(raw);
    const d = DEFAULTS();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  } catch {
    return DEFAULTS();
  }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}

export const db = {
  get state() { return state; },
  get settings() { return state.settings; },
  setSetting(k, v) { state.settings[k] = v; save(); },

  plan(id) { return state.plans.find((p) => p.id === id); },
  upsertPlan(plan) {
    plan.updatedAt = Date.now();
    const i = state.plans.findIndex((p) => p.id === plan.id);
    if (i >= 0) state.plans[i] = plan; else state.plans.push({ createdAt: Date.now(), ...plan });
    save();
  },
  deletePlan(id) {
    state.plans = state.plans.filter((p) => p.id !== id);
    state.schedule = state.schedule.filter((s) => s.planId !== id);
    state.weekly = state.weekly.filter((s) => s.planId !== id);
    save();
  },
  plansForMuscles(muscles) {
    const set = new Set(muscles);
    return state.plans
      .map((p) => ({ p, hit: p.muscles.filter((m) => set.has(m)).length }))
      .filter((x) => x.hit > 0)
      .sort((a, b) => b.hit - a.hit || (b.p.updatedAt || 0) - (a.p.updatedAt || 0))
      .map((x) => x.p);
  },

  isFav(id) { return state.favorites.includes(id); },
  toggleFav(id) {
    state.favorites = state.favorites.includes(id) ? state.favorites.filter((x) => x !== id) : [...state.favorites, id];
    save();
    return state.favorites.includes(id);
  },

  addSession(s) { state.sessions.push(s); save(); },
  deleteSession(id) { state.sessions = state.sessions.filter((s) => s.id !== id); save(); },
  sessionsOn(dateKey) { return state.sessions.filter((s) => s.date.slice(0, 10) === dateKey); },
  lastSetsFor(exId) {
    for (let i = state.sessions.length - 1; i >= 0; i--) {
      const e = state.sessions[i].entries.find((x) => x.exId === exId);
      if (e && e.sets.some((s) => s.done)) return e.sets.filter((s) => s.done);
    }
    return null;
  },

  schedule(dateKey, planId) {
    if (!state.schedule.some((s) => s.date === dateKey && s.planId === planId)) {
      state.schedule.push({ date: dateKey, planId });
      save();
    }
  },
  unschedule(dateKey, planId) {
    state.schedule = state.schedule.filter((s) => !(s.date === dateKey && s.planId === planId));
    save();
  },
  scheduledOn(dateKey) { return state.schedule.filter((s) => s.date === dateKey); },

  /* البرنامج الأسبوعي المتكرر */
  addWeekly(dow, planId, from) {
    if (!state.weekly.some((w) => w.dow === dow && w.planId === planId)) {
      state.weekly.push({ dow, planId, from });
      save();
    }
  },
  removeWeekly(dow, planId) {
    state.weekly = state.weekly.filter((w) => !(w.dow === dow && w.planId === planId));
    save();
  },
  /** كل الخطط المجدولة في تاريخ: الخاصة باليوم + المتكررة أسبوعيًا (من تاريخ إضافتها) */
  scheduledFor(dateKey) {
    const dow = new Date(dateKey + 'T12:00:00').getDay();
    const out = state.schedule.filter((s) => s.date === dateKey).map((s) => ({ planId: s.planId, recurring: false }));
    state.weekly.filter((w) => w.dow === dow && w.from <= dateKey && !out.some((o) => o.planId === w.planId))
      .forEach((w) => out.push({ planId: w.planId, recurring: true }));
    return out.filter((o) => state.plans.some((p) => p.id === o.planId));
  },

  exportJSON() { return JSON.stringify(state, null, 2); },
  importJSON(text) {
    const s = JSON.parse(text);
    if (!s || !Array.isArray(s.plans) || !Array.isArray(s.sessions)) throw new Error('ملف غير صالح');
    const d = DEFAULTS();
    state = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
    save();
  },
  reset() { state = DEFAULTS(); save(); },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
