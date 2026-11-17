// مستودع التمارين: تحميل قاعدة البيانات + الوسائط المتحركة
import { db } from './store.js';

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
// مصدر GIF اختياري (ExerciseDB). يُجلب من جهاز المستخدم عند الطلب، ويُرجع للصور عند الفشل.
const GIF_API = 'https://exercisedb-api.vercel.app/api/v1/exercises/search';

let all = [];
let byId = new Map();

export async function loadExercises() {
  if (all.length) return all;
  const res = await fetch('data/exercises.json');
  all = await res.json();
  byId = new Map(all.map((e) => [e.id, e]));
  return all;
}

export const exercises = () => all;
export const ex = (id) => byId.get(id);
export const imgUrl = (e, i = 0) => `${IMG_BASE}${encodeURIComponent(e.id)}/${i}.jpg`;

/** تمارين تستهدف العضلات المختارة: الأساسية أولًا ثم الثانوية */
export function forMuscles(muscles, { includeSecondary = false } = {}) {
  const set = new Set(muscles);
  const score = (e) => {
    let s = 0;
    e.primary.forEach((m) => { if (set.has(m)) s += 10; });
    if (includeSecondary) e.secondary.forEach((m) => { if (set.has(m)) s += 1; });
    return s;
  };
  return all
    .map((e) => [e, score(e)])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]) || a[0].name.localeCompare(b[0].name))
    .map(([e]) => e);
}

// تمارين شائعة في الأندية تظهر أولًا في الاقتراحات
const POPULAR = [
  'barbell bench press - medium grip', 'dumbbell bench press', 'incline dumbbell press', 'butterfly', 'dips - chest version',
  'cable crossover', 'pushups', 'wide-grip lat pulldown', 'seated cable rows', 'bent over barbell row', 'pullups',
  'one-arm dumbbell row', 'barbell squat', 'leg press', 'leg extensions', 'lying leg curls', 'romanian deadlift',
  'barbell deadlift', 'standing calf raises', 'seated calf raise', 'dumbbell shoulder press', 'side lateral raise',
  'reverse flyes', 'face pull', 'barbell curl', 'dumbbell bicep curl', 'hammer curls', 'triceps pushdown',
  'dips - triceps version', 'lying triceps press', 'crunches', 'plank', 'hanging leg raise', 'barbell hip thrust',
  'barbell shrug', 'dumbbell lunges', 'thigh adductor', 'thigh abductor', 'hyperextensions (back extensions)',
];
const POP = new Map(POPULAR.map((n, i) => [n, i]));

// تفضيل تمارين القوة والأجهزة الشائعة في النادي
function rank(e) {
  const pop = POP.get(e.name.toLowerCase());
  if (pop != null) return -100 + pop;
  const cat = e.category === 'strength' ? 0 : e.category === 'stretching' ? 3 : 1;
  const eq = { machine: 0, cable: 0, barbell: 0, dumbbell: 0, 'e-z curl bar': 1, 'body only': 1 }[e.equipment] ?? 2;
  const lvl = { beginner: 0, intermediate: 0, expert: 1 }[e.level] ?? 1;
  return cat * 10 + eq * 3 + lvl;
}

export function search(q, { muscle = '', equipment = '' } = {}) {
  const t = q.trim().toLowerCase();
  return all.filter((e) =>
    (!muscle || e.primary.includes(muscle)) &&
    (!equipment || e.equipment === equipment) &&
    (!t || e.name.toLowerCase().includes(t)));
}

/**
 * عنصر وسائط متحرك: يحاول GIF أولًا (إن فُعّل)، وإلا يبدّل بين صورتي الحركة (بداية/نهاية)
 * ليظهر كأنه GIF.
 */
export function mediaEl(e, { small = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'media' + (small ? ' small' : '');
  const img = document.createElement('img');
  img.alt = e.name;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = imgUrl(e, 0);
  img.onerror = () => wrap.classList.add('noimg');
  wrap.appendChild(img);

  let frame = 0;
  let timer = null;
  const startFrames = () => {
    if (small || e.images < 2 || timer) return;
    const next = new Image();
    next.src = imgUrl(e, 1);
    timer = setInterval(() => {
      if (!wrap.isConnected) { clearInterval(timer); return; }
      frame = 1 - frame;
      img.src = imgUrl(e, frame);
    }, 900);
  };

  if (!small && db.settings.gif) {
    findGif(e).then((g) => {
      if (g && wrap.isConnected) {
        img.src = g.url;
        img.onerror = () => { img.onerror = null; startFrames(); };
        const cap = document.createElement('div');
        cap.className = 'media-cap';
        cap.textContent = `GIF: ${g.name}`;
        wrap.appendChild(cap);
      } else startFrames();
    });
  } else startFrames();
  return wrap;
}

const GIF_CACHE_KEY = 'gymapp.gifcache';
function gifCache() {
  try { return JSON.parse(localStorage.getItem(GIF_CACHE_KEY) || '{}'); } catch { return {}; }
}

function cleanName(n) {
  return n.toLowerCase()
    .replace(/\s*-\s*(medium|wide|close)[- ]grip/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findGif(e) {
  const cache = gifCache();
  if (e.id in cache) return cache[e.id];
  let result = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const q = cleanName(e.name);
    const res = await fetch(`${GIF_API}?q=${encodeURIComponent(q)}&limit=1&threshold=0.3`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      const hit = (j.data || [])[0];
      if (hit && hit.gifUrl) result = { url: hit.gifUrl, name: hit.name };
    }
  } catch { return null; } // خطأ شبكة: لا نخزّن، نعيد المحاولة لاحقًا
  cache[e.id] = result;
  try { localStorage.setItem(GIF_CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore */ }
  return result;
}

export function clearGifCache() { localStorage.removeItem(GIF_CACHE_KEY); }
