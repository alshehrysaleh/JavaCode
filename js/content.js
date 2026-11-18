// مستودع التمارين يُدار بالكامل من لوحة التحكم.
// كل تمرين وثيقة في قاعدة بيانات الصفحة: exercises/<id>
//   {name, ar, primary[], secondary[], equipment, images[assetId], kinds{assetId:'video'}, desc, createdAt, updatedAt}
// والصور/المقاطع في مخزن أصول الصفحة. القراءة لكل من يفتح التطبيق، والكتابة للمالك والمحررين.

const COLLECTION = 'exercises';
const docs = new Map(); // id -> body
const listeners = new Set();

let dbApi = null;
let assetsApi = null;
let userApi = null;
let state = 'loading'; // loading | live | offline | unavailable
let ready = null;

const runtime = () => (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function' ? window.claude : null);

export function initContent() {
  if (ready) return ready;
  ready = (async () => {
    const c = runtime();
    if (!c) { state = 'unavailable'; emit(); return; }
    try { dbApi = await c.use('db'); } catch { dbApi = null; }
    try { userApi = await c.use('user'); } catch { userApi = null; }
    if (!dbApi) { state = 'unavailable'; emit(); return; }
    const timer = setTimeout(() => { if (state === 'loading') { state = 'offline'; emit(); } }, 10000);
    dbApi.collection(COLLECTION).onSnapshot((snap) => {
      docs.clear();
      snap.docs.forEach((d) => { if (d.exists) docs.set(d.id, d.data()); });
      if (!snap.metadata.fromCache) { clearTimeout(timer); state = 'live'; }
      else if (state === 'loading' && snap.size) state = 'live';
      emit();
    }, () => { clearTimeout(timer); state = 'offline'; emit(); });
  })();
  return ready;
}

function emit() { listeners.forEach((fn) => { try { fn(state); } catch { /* ignore */ } }); }
export function onContentChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const contentState = () => state;
export const blobUrl = (assetId) => '/_blob/' + assetId;

/** كل التمارين بصيغة موحّدة، الأحدث أولًا */
export function adminExercises() {
  return [...docs].map(([id, d]) => ({
    id,
    name: d.name || d.ar || 'تمرين',
    ar: d.ar || '',
    primary: Array.isArray(d.primary) ? d.primary : [],
    secondary: Array.isArray(d.secondary) ? d.secondary : [],
    equipment: d.equipment || 'machine',
    desc: d.desc || '',
    images: Array.isArray(d.images) ? d.images : [],
    kinds: d.kinds || {},
    category: 'strength',
    level: null,
    instructions: [],
    createdAt: d.createdAt || 0,
  })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** وسائط تمرين: [{id, url, video}] */
export function adminImages(id) {
  const d = docs.get(id);
  if (!d || !Array.isArray(d.images)) return [];
  const kinds = d.kinds || {};
  return d.images.map((a) => ({ id: a, url: blobUrl(a), video: kinds[a] === 'video' }));
}
export const isVideoAsset = (exId, assetId) => ((docs.get(exId) || {}).kinds || {})[assetId] === 'video';

/* ===== صلاحيات المدير ===== */
export async function adminAccess() {
  await initContent();
  if (!dbApi) return { ok: false, reason: 'unavailable' };
  const canEdit = userApi ? await userApi.canEdit() : false;
  if (!canEdit) return { ok: false, reason: 'not_editor' };
  if (!assetsApi) { try { assetsApi = await runtime().use('assets'); } catch { assetsApi = null; } }
  return { ok: true, assets: !!assetsApi };
}

/* ===== الكتابة (كتابة واحدة في كل مرة لكل وثيقة) ===== */
const writing = new Map();
function writeDoc(id, body) {
  const prev = writing.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => dbApi.doc(`${COLLECTION}/${id}`).set({ ...body, updatedAt: Date.now() }));
  writing.set(id, next);
  return next;
}
function current(id) {
  const d = docs.get(id) || {};
  return {
    name: d.name || '', ar: d.ar || '', primary: [...(d.primary || [])], secondary: [...(d.secondary || [])],
    equipment: d.equipment || 'machine', desc: d.desc || '',
    images: [...(d.images || [])], kinds: { ...(d.kinds || {}) }, createdAt: d.createdAt || Date.now(),
  };
}
const newId = () => 'ex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function createExercise(fields) {
  const id = newId();
  await writeDoc(id, { ...current(id), ...clean(fields), createdAt: Date.now() });
  return id;
}

export async function updateExercise(id, fields) {
  return writeDoc(id, { ...current(id), ...clean(fields) });
}

function clean(f) {
  const out = {};
  if ('name' in f) out.name = String(f.name || '').trim();
  if ('ar' in f) out.ar = String(f.ar || '').trim();
  if ('desc' in f) out.desc = String(f.desc || '').trim();
  if ('equipment' in f) out.equipment = f.equipment;
  if ('primary' in f) out.primary = [...new Set(f.primary)];
  if ('secondary' in f) out.secondary = [...new Set(f.secondary)].filter((m) => !(f.primary || []).includes(m));
  return out;
}

/** يحذف التمرين وكل صوره نهائيًا */
export async function deleteExercise(id) {
  const c = current(id);
  await dbApi.doc(`${COLLECTION}/${id}`).delete();
  for (const a of c.images) { try { await assetsApi.delete(a); } catch { /* ignore */ } }
}

const VIDEO_OK = ['video/mp4', 'video/webm'];

/**
 * يرفع صورًا أو مقاطع فيديو ويضيفها لتمرين.
 * GIF يُرفع كما هو، والصور الكبيرة تُصغَّر، والفيديو يُحوَّل إلى GIF (convertVideo) أو يُرفع كما هو.
 * onProgress(i, n, label, fraction)
 */
export async function addImages(id, files, onProgress, { convertVideo = true } = {}) {
  if (!assetsApi) throw new Error('رفع الصور متاح للمالك والمحررين فقط');
  const added = [];
  const kinds = {};
  let i = 0;
  for (const f of files) {
    i++;
    const isVideo = f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name || '');
    let blob = f;
    let kind = 'image';
    if (isVideo && convertVideo) {
      const { videoToGif } = await import('./video2gif.js');
      blob = await videoToGif(f, { onProgress: (p) => onProgress && onProgress(i, files.length, 'تحويل إلى GIF', p) });
      if (blob.size > 20 * 1048576) {
        blob = await videoToGif(f, { maxWidth: 360, fps: 8, onProgress: (p) => onProgress && onProgress(i, files.length, 'ضغط GIF', p) });
      }
    } else if (isVideo) {
      if (!VIDEO_OK.includes(f.type)) throw new Error(`صيغة الفيديو «${f.name}» غير مدعومة للرفع المباشر؛ فعّل «تحويل الفيديو إلى GIF» أو استخدم MP4/WebM`);
      kind = 'video';
    } else if (f.type !== 'image/gif' && f.type !== 'image/svg+xml') {
      blob = await shrink(f, 1400, 0.85);
    }
    onProgress && onProgress(i, files.length, 'رفع', 1);
    const r = await assetsApi.upload(blob, blob.type ? undefined : { type: 'image/jpeg' });
    added.push(r.id);
    if (kind === 'video') kinds[r.id] = 'video';
  }
  const c = current(id);
  await writeDoc(id, { ...c, images: [...c.images, ...added], kinds: { ...c.kinds, ...kinds } });
  return added;
}

export async function setImageOrder(id, images) {
  return writeDoc(id, { ...current(id), images });
}

export async function removeImage(id, assetId) {
  const c = current(id);
  const kinds = { ...c.kinds }; delete kinds[assetId];
  await writeDoc(id, { ...c, images: c.images.filter((x) => x !== assetId), kinds });
  try { await assetsApi.delete(assetId); } catch { /* ignore */ }
}

export async function storageUsage() {
  if (!assetsApi) return null;
  try { return (await assetsApi.list()).usage; } catch { return null; }
}

function shrink(file, max, quality) {
  return new Promise((resolve) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      if (k === 1 && /image\/(jpeg|png|webp)/.test(file.type)) { URL.revokeObjectURL(src); resolve(file); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      c.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(src); resolve(file); };
    img.src = src;
  });
}
