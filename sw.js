// عامل الخدمة: يجعل التطبيق يعمل دون اتصال داخل النادي
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const MEDIA = 'media-v1';
const ASSETS = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'js/bodymap.js', 'js/store.js',
  'js/labels.js', 'js/exercises.js', 'data/exercises.json', 'manifest.webmanifest', 'icons/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isMedia = /\.(jpg|jpeg|png|gif|webp)$/i.test(url.pathname) || url.hostname.includes('fonts.g');
  if (url.origin === location.origin) {
    // الشبكة أولًا لملفات التطبيق، ثم النسخة المخزنة
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
  } else if (isMedia) {
    // الذاكرة أولًا للصور: ما شاهدته مرة يعمل بلا إنترنت
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(MEDIA).then((c) => c.put(req, copy));
      }
      return res;
    })));
  }
});
