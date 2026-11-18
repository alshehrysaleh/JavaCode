// محتوى لوحة التحكم: صور ونصوص التمارين التي يحررها المالك من لوحة التحكم.
// تُخزَّن في قاعدة بيانات الصفحة المنشورة (db) والصور في مخزن الأصول (assets)،
// فتصل إلى كل من يفتح التطبيق. خارج claude.ai يعمل التطبيق بالمحتوى الافتراضي.

const COLLECTION = 'content';
const overrides = new Map(); // exId -> {images: [assetId], desc, ar, updatedAt}
const listeners = new Set();

let dbApi = null;
let assetsApi = null;
let userApi = null;
let state = 'loading'; // loading | live | offline | unavailable
let ready = null;

const runtime = () => (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function' ? window.claude : null);

/** يبدأ الاتصال ويشترك مرة واحدة في تعديلات المحتوى */
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
      overrides.clear();
      snap.docs.forEach((d) => { if (d.exists) overrides.set(d.id, d.data()); });
      if (!snap.metadata.fromCache) { clearTimeout(timer); state = 'live'; }
      emit();
    }, () => { clearTimeout(timer); state = 'offline'; emit(); });
  })();
  return ready;
}

function emit() { listeners.forEach((fn) => { try { fn(state); } catch { /* ignore */ } }); }
export function onContentChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export const contentState = () => state;

export const override = (id) => overrides.get(id) || null;
export const editedIds = () => [...overrides.keys()];
export const blobUrl = (assetId) => '/_blob/' + assetId;

/** صور لوحة التحكم لتمرين (روابط عرض) */
export function adminImages(id) {
  const o = overrides.get(id);
  return o && Array.isArray(o.images) ? o.images.map(blobUrl) : [];
}

/* ===== صلاحيات المدير ===== */
export async function adminAccess() {
  await initContent();
  if (!dbApi) return { ok: false, reason: 'unavailable' };
  const canEdit = userApi ? await userApi.canEdit() : false;
  if (!canEdit) return { ok: false, reason: 'not_editor' };
  if (!assetsApi) { try { assetsApi = await runtime().use('assets'); } catch { assetsApi = null; } }
  return { ok: true, assets: !!assetsApi };
}

/* ===== كتابة المحتوى (للمالك والمحررين) ===== */
const writing = new Map();
async function writeDoc(id, body) {
  // كتابة واحدة في كل مرة لكل وثيقة
  const prev = writing.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => dbApi.doc(`${COLLECTION}/${id}`).set({ ...body, updatedAt: Date.now() }));
  writing.set(id, next);
  return next;
}

function current(id) {
  const o = overrides.get(id) || {};
  return { images: Array.isArray(o.images) ? [...o.images] : [], desc: o.desc || '', ar: o.ar || '' };
}

export async function saveText(id, { desc, ar }) {
  const c = current(id);
  const body = { ...c, desc: desc.trim(), ar: ar.trim() };
  if (!body.images.length && !body.desc && !body.ar) return dbApi.doc(`${COLLECTION}/${id}`).delete();
  return writeDoc(id, body);
}

/** يرفع صورًا ويضيفها لتمرين. صور GIF تُرفع كما هي لتبقى متحركة. */
export async function addImages(id, files, onProgress) {
  if (!assetsApi) throw new Error('رفع الصور متاح للمالك والمحررين فقط');
  const ids = [];
  let i = 0;
  for (const f of files) {
    onProgress && onProgress(++i, files.length);
    const blob = f.type === 'image/gif' || f.type === 'image/svg+xml' ? f : await shrink(f, 1400, 0.85);
    const r = await assetsApi.upload(blob, blob.type ? undefined : { type: 'image/jpeg' });
    ids.push(r.id);
  }
  const c = current(id);
  await writeDoc(id, { ...c, images: [...c.images, ...ids] });
  return ids;
}

export async function setImageOrder(id, images) {
  const c = current(id);
  return writeDoc(id, { ...c, images });
}

export async function removeImage(id, assetId) {
  const c = current(id);
  const images = c.images.filter((x) => x !== assetId);
  if (!images.length && !c.desc && !c.ar) await dbApi.doc(`${COLLECTION}/${id}`).delete();
  else await writeDoc(id, { ...c, images });
  try { await assetsApi.delete(assetId); } catch { /* الصورة غير موجودة أصلًا */ }
}

/** يعيد التمرين إلى المحتوى الافتراضي (يحذف صوره ونصوصه من اللوحة) */
export async function resetExercise(id) {
  const c = current(id);
  await dbApi.doc(`${COLLECTION}/${id}`).delete();
  for (const a of c.images) { try { await assetsApi.delete(a); } catch { /* ignore */ } }
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
