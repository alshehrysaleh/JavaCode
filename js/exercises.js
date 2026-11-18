// مستودع التمارين: التمارين التي يضيفها المدير من لوحة التحكم + أجهزة المستخدم الخاصة
import { hasPhoto, photoUrl } from './photos.js';
import { adminExercises, adminImages, onContentChange, initContent } from './content.js';

let custom = [];
let all = [];
let byId = new Map();

function rebuild() {
  all = [...custom, ...adminExercises()];
  byId = new Map(all.map((e) => [e.id, e]));
}

export async function loadExercises() {
  initContent();
  onContentChange(rebuild);
  rebuild();
  return all;
}

/** أجهزة أضافها المستخدم على جهازه (تظهر أولًا) */
export function setCustom(list) {
  custom = list.map((c) => ({ secondary: [], category: 'strength', level: null, instructions: [], ...c, custom: true }));
  rebuild();
}

export const exercises = () => all;
export const ex = (id) => byId.get(id);

/** تمارين تستهدف العضلات المختارة: الأساسية أولًا ثم الثانوية */
export function forMuscles(muscles, { includeSecondary = true } = {}) {
  const set = new Set(muscles);
  const score = (e) => {
    let s = 0;
    e.primary.forEach((m) => { if (set.has(m)) s += 10; });
    if (includeSecondary) (e.secondary || []).forEach((m) => { if (set.has(m)) s += 1; });
    return s;
  };
  return all
    .map((e) => [e, score(e)])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([e]) => e);
}

// توحيد الحروف العربية لتسهيل البحث (أ إ آ ← ا، ة ← ه، ى ← ي)
const norm = (x = '') => x.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْ]/g, '');

export function search(q, { muscle = '', equipment = '' } = {}) {
  const t = norm(q.trim());
  return all.filter((e) =>
    (!muscle || e.primary.includes(muscle) || (e.secondary || []).includes(muscle)) &&
    (!equipment || e.equipment === equipment) &&
    (!t || norm(e.name).includes(t) || norm(e.ar).includes(t)));
}

/**
 * عنصر الوسائط: صورة الجهاز الشخصية ← صور/مقاطع لوحة التحكم ← أيقونة بديلة.
 * الفيديو يُعرض صامتًا متكررًا كأنه GIF، وعند تعدد الوسائط تظهر في معرض.
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

  if (own && hasPhoto(e.id)) {
    wrap.classList.add('own');
    photoUrl(e.id).then((u) => { if (u) img.src = u; });
    const badge = document.createElement('span');
    badge.className = 'own-badge';
    badge.textContent = '📷 ناديك';
    wrap.appendChild(badge);
    return wrap;
  }

  const media = adminImages(e.id);
  if (!media.length) { wrap.classList.remove('loading'); wrap.classList.add('noimg'); return wrap; }

  wrap.classList.add('admin');
  let vid = null;
  const show = (m) => {
    if (m.video) {
      img.style.display = 'none';
      if (!vid) {
        vid = document.createElement('video');
        vid.muted = true; vid.loop = true; vid.playsInline = true;
        vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
        vid.preload = small ? 'metadata' : 'auto';
        vid.autoplay = !small;
        vid.onloadeddata = () => wrap.classList.remove('loading');
        wrap.insertBefore(vid, img);
      }
      vid.src = small ? m.url + '#t=0.1' : m.url;
      if (!small) vid.play().catch(() => {});
    } else {
      if (vid) { vid.pause(); vid.remove(); vid = null; }
      img.style.display = '';
      img.src = m.url;
    }
  };
  show(media[0]);
  if (small || media.length === 1) return wrap;

  const gal = document.createElement('div');
  gal.className = 'gallery';
  const thumbs = document.createElement('div');
  thumbs.className = 'gal-thumbs';
  media.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'gal-thumb' + (i === 0 ? ' on' : '') + (m.video ? ' is-video' : '');
    b.setAttribute('aria-label', `${m.video ? 'فيديو' : 'صورة'} ${i + 1}`);
    let t;
    if (m.video) { t = document.createElement('video'); t.muted = true; t.preload = 'metadata'; t.src = m.url + '#t=0.1'; }
    else { t = document.createElement('img'); t.src = m.url; t.alt = ''; }
    b.appendChild(t);
    b.onclick = (ev) => {
      ev.stopPropagation();
      show(m);
      thumbs.querySelectorAll('.gal-thumb').forEach((x) => x.classList.toggle('on', x === b));
    };
    thumbs.appendChild(b);
  });
  gal.append(wrap, thumbs);
  return gal;
}
