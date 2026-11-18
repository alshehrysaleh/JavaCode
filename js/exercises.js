// مستودع التمارين: تحميل قاعدة البيانات + الوسائط المتحركة
import { db } from './store.js';
import { hasPhoto, photoUrl } from './photos.js';
import { adminImages } from './content.js';

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
// مصدر GIF اختياري (ExerciseDB). يُجلب من جهاز المستخدم عند الطلب، ويُرجع للصور عند الفشل.
const GIF_API = 'https://exercisedb-api.vercel.app/api/v1/exercises/search';

let base = [];
let all = [];
let byId = new Map();

export async function loadExercises() {
  if (base.length) return all;
  const res = await fetch('data/exercises.json');
  base = await res.json();
  setCustom([]);
  return all;
}

/** يدمج أجهزة النادي التي أضافها المستخدم في المستودع (تظهر أولًا) */
export function setCustom(list) {
  all = [...list.map((c) => ({ secondary: [], category: 'strength', level: 'beginner', mechanic: null, images: 0, instructions: [], ...c, custom: true })), ...base];
  byId = new Map(all.map((e) => [e.id, e]));
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

// توحيد الحروف العربية لتسهيل البحث (أ إ آ ← ا، ة ← ه، ى ← ي)
const norm = (x = '') => x.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u0652]/g, '');

export function search(q, { muscle = '', equipment = '' } = {}) {
  const t = q.trim().toLowerCase();
  return all.filter((e) =>
    (!muscle || e.primary.includes(muscle)) &&
    (!equipment || e.equipment === equipment) &&
    (!t || e.name.toLowerCase().includes(t) || norm(e.ar).includes(norm(t))));
}

/* ===== الصور المضمّنة في التطبيق (data/img) =====
 * thumbs/<العضلة>.json : صورة مصغرة لكل تمرين
 * full/<رقم>.json      : صورتا الحركة بحجم أكبر
 * تُحمَّل من نفس موقع التطبيق فتعمل في أي استضافة ودون إنترنت بعد أول فتح. */
const chunkCache = new Map();
function loadChunk(path) {
  if (!chunkCache.has(path)) {
    chunkCache.set(path, fetch(path).then((r) => (r.ok ? r.json() : {})).catch(() => {
      chunkCache.delete(path);
      return {};
    }));
  }
  return chunkCache.get(path);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(str) {
  let c = 0xffffffff;
  for (const b of new TextEncoder().encode(str)) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const FULL_CHUNKS = 64;

async function thumbSrc(e) {
  const m = await loadChunk(`data/img/thumbs/${(e.primary[0] || 'other').replace(/ /g, '_')}.json`);
  return m[e.id] || imgUrl(e, 0);
}
async function frameSrcs(e) {
  const m = await loadChunk(`data/img/full/${crc32(e.id) % FULL_CHUNKS}.json`);
  return m[e.id] || Array.from({ length: e.images }, (_, i) => imgUrl(e, i));
}

/**
 * عنصر وسائط متحرك: يبدّل بين صورتي الحركة (بداية/نهاية) فيظهر كأنه GIF،
 * وإن فُعّل خيار GIF ووُجد GIF متاح يُعرض بدلًا منهما.
 */
export function mediaEl(e, { small = false, own = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'media loading' + (small ? ' small' : '');
  const img = document.createElement('img');
  img.alt = e.name;
  img.decoding = 'async';
  img.onload = () => wrap.classList.remove('loading');
  img.onerror = () => { wrap.classList.remove('loading'); wrap.classList.add('noimg'); };
  wrap.appendChild(img);

  // صورة جهاز النادي التي صوّرها المستخدم لها الأولوية
  if (own && hasPhoto(e.id)) {
    wrap.classList.add('own');
    photoUrl(e.id).then((u) => { if (u) img.src = u; });
    const badge = document.createElement('span');
    badge.className = 'own-badge';
    badge.textContent = '📷 ناديك';
    wrap.appendChild(badge);
    return wrap;
  }
  // صور لوحة التحكم تأتي بعد صورة الجهاز الشخصية وقبل الصور الافتراضية
  const admin = own ? adminImages(e.id) : [];
  if (admin.length) {
    wrap.classList.add('admin');
    img.src = admin[0];
    if (small || admin.length === 1) return wrap;
    const gal = document.createElement('div');
    gal.className = 'gallery';
    const thumbs = document.createElement('div');
    thumbs.className = 'gal-thumbs';
    admin.forEach((u, i) => {
      const b = document.createElement('button');
      b.className = 'gal-thumb' + (i === 0 ? ' on' : '');
      b.setAttribute('aria-label', `صورة ${i + 1}`);
      const t = document.createElement('img');
      t.src = u; t.alt = '';
      b.appendChild(t);
      b.onclick = (ev) => {
        ev.stopPropagation();
        img.src = u;
        thumbs.querySelectorAll('.gal-thumb').forEach((x) => x.classList.toggle('on', x === b));
      };
      thumbs.appendChild(b);
    });
    gal.append(wrap, thumbs);
    return gal;
  }
  if (e.custom) { wrap.classList.remove('loading'); wrap.classList.add('noimg'); return wrap; }

  if (small) {
    thumbSrc(e).then((src) => { img.src = src; });
    return wrap;
  }

  let timer = null;
  frameSrcs(e).then((frames) => {
    if (!frames.length) { wrap.classList.add('noimg'); return; }
    let frame = 0;
    img.src = frames[0];
    if (frames.length > 1) {
      timer = setInterval(() => {
        if (!wrap.isConnected && wrap.dataset.started) { clearInterval(timer); return; }
        if (wrap.isConnected) wrap.dataset.started = '1';
        frame = (frame + 1) % frames.length;
        img.src = frames[frame];
      }, 900);
    }
  });

  if (db.settings.gif) {
    findGif(e).then((g) => {
      if (!g) return;
      const gif = new Image();
      gif.onload = () => {
        clearInterval(timer);
        img.src = g.url;
        const cap = document.createElement('div');
        cap.className = 'media-cap';
        cap.textContent = `GIF: ${g.name}`;
        wrap.appendChild(cap);
      };
      gif.src = g.url;
    });
  }
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
