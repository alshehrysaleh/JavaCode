// صور أجهزة النادي التي يلتقطها المستخدم (تُحفظ على الجهاز في IndexedDB)
const DB_NAME = 'gymapp-photos';
const STORE = 'photos';

let dbPromise = null;
let ids = new Set();
const urls = new Map();

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function initPhotos() {
  try { ids = new Set(await tx('readonly', (s) => s.getAllKeys())); } catch { ids = new Set(); }
}

export const hasPhoto = (id) => ids.has(id);

export async function photoUrl(id) {
  if (!ids.has(id)) return null;
  if (urls.has(id)) return urls.get(id);
  const blob = await tx('readonly', (s) => s.get(id));
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}

/** يصغّر الصورة (أقصى بُعد 1000px) ويحفظها لتمرين */
export async function savePhoto(id, file) {
  const blob = await resize(file, 1000, 0.82);
  await tx('readwrite', (s) => s.put(blob, id));
  ids.add(id);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}

export async function deletePhoto(id) {
  await tx('readwrite', (s) => s.delete(id));
  ids.delete(id);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}

function resize(file, max, quality) {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('تعذر معالجة الصورة'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('صيغة الصورة غير مدعومة')); };
    img.src = src;
  });
}

/* ===== النسخ الاحتياطي ===== */
const toDataUrl = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });

export async function exportPhotos() {
  const out = {};
  for (const id of ids) {
    const blob = await tx('readonly', (s) => s.get(id));
    if (blob) out[id] = await toDataUrl(blob);
  }
  return out;
}

export async function importPhotos(map = {}) {
  for (const [id, dataUrl] of Object.entries(map)) {
    const blob = await (await fetch(dataUrl)).blob();
    await tx('readwrite', (s) => s.put(blob, id));
    ids.add(id);
  }
}

export async function clearPhotos() {
  await tx('readwrite', (s) => s.clear());
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  ids = new Set();
}
