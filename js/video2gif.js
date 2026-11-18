// تحويل مقطع فيديو إلى صورة GIF متحركة داخل المتصفح (دون رفع الفيديو لأي خادم)
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';

function once(el, ev) {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('تعذر قراءة الفيديو (صيغة غير مدعومة في هذا المتصفح)')); };
    const cleanup = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

/**
 * @param {File|Blob} file مقطع الفيديو
 * @param {{maxWidth?:number, fps?:number, maxSeconds?:number, onProgress?:(p:number)=>void}} opts
 * @returns {Promise<Blob>} صورة GIF متحركة تتكرر بلا نهاية
 */
export async function videoToGif(file, { maxWidth = 480, fps = 10, maxSeconds = 8, onProgress } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadeddata');
    const duration = Math.min(isFinite(video.duration) ? video.duration : maxSeconds, maxSeconds);
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const w = Math.max(2, Math.round(video.videoWidth * scale));
    const h = Math.max(2, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const gif = GIFEncoder();
    const step = 1 / fps;
    const total = Math.max(1, Math.floor(duration * fps));
    for (let i = 0; i < total; i++) {
      video.currentTime = Math.min(i * step, Math.max(0, video.duration - 0.05));
      await once(video, 'seeked');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(video, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256);
      const index = applyPalette(data, palette);
      gif.writeFrame(index, w, h, { palette, delay: Math.round(1000 / fps), repeat: 0 });
      onProgress && onProgress((i + 1) / total);
      if (i % 5 === 4) await new Promise((r) => setTimeout(r)); // إبقاء الواجهة مستجيبة
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
