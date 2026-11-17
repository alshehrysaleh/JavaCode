// خريطة الجسم التفاعلية (SVG أصلي). يُرسم النصف الأيسر ثم يُعكس للنصف الأيمن.
// كل منطقة تحمل data-m = اسم العضلة كما في قاعدة البيانات.

const MIRROR = 'matrix(-1 0 0 1 200 0)';

// أجزاء غير عضلية (الرأس، اليدان، الركبتان، القدمان...)
const FRONT_BASE = [
  // الجذع والأطراف كخلفية
  'M100 56 L90 58 Q86 66 80 70 Q62 74 52 80 Q40 90 40 112 Q38 130 38 150 Q30 172 26 196 Q22 208 24 220 Q30 224 34 216 Q36 208 38 200 Q48 182 54 164 Q60 148 62 132 L64 150 Q66 170 64 186 Q58 214 58 244 Q60 276 66 296 Q62 330 64 360 Q66 390 70 410 Q62 420 66 428 L84 428 Q86 416 84 404 Q86 372 88 340 Q90 318 88 300 Q94 270 96 236 L100 212 Z',
];

const FRONT = {
  neck: ['M90 52 Q92 60 89 66 L100 68 L100 56 Q94 56 90 52 Z'],
  traps: ['M89 66 Q80 72 68 76 Q80 78 92 74 L100 74 L100 68 Z'],
  shoulders: ['M68 76 Q50 78 44 94 Q40 108 44 120 Q52 110 58 102 Q64 92 72 84 Q70 80 68 76 Z'],
  chest: ['M100 76 L74 82 Q64 92 62 106 Q66 120 80 124 Q92 124 100 118 Z'],
  biceps: ['M44 122 Q40 136 41 150 Q45 158 51 157 Q57 146 59 132 Q59 116 60 104 Q50 110 44 122 Z'],
  forearms: ['M41 156 Q33 176 30 196 L37 200 Q46 186 53 168 Q56 162 52 158 Q46 160 41 156 Z'],
  abdominals: [
    'M100 126 L84 128 Q82 152 84 176 Q90 196 100 204 Z',
    'M64 108 Q66 130 68 152 Q70 168 76 182 L83 176 Q81 152 83 128 Q72 126 64 108 Z',
  ],
  abductors: ['M68 176 Q62 190 61 208 Q66 196 72 188 Z'],
  quadriceps: ['M73 188 Q63 210 63 242 Q65 272 73 290 Q81 294 86 288 Q92 262 93 232 Q93 214 91 204 Q82 198 73 188 Z'],
  adductors: ['M92 204 Q99 208 99 216 Q98 236 95 252 Q93 260 90 264 Q93 240 92 204 Z'],
  calves: ['M70 304 Q64 330 67 358 Q71 380 77 386 Q83 360 85 332 Q86 314 84 304 Q77 300 70 304 Z'],
};
// خطوط زخرفية لعضلات البطن
const FRONT_DECOR = [
  'M100 126 L100 200', 'M86 140 Q93 138 100 140', 'M85 154 Q93 152 100 154', 'M85 168 Q93 166 100 168',
  'M74 296 Q80 300 86 294', // الركبة
];

const BACK_BASE = FRONT_BASE;

const BACK = {
  neck: ['M90 54 Q92 60 90 64 L100 62 L100 58 Q94 58 90 54 Z'],
  traps: ['M100 60 L90 64 Q80 72 68 78 Q84 82 90 90 Q96 112 100 128 Z'],
  shoulders: ['M68 78 Q50 80 44 96 Q41 108 44 120 Q52 110 58 102 Q64 92 72 86 Q70 82 68 78 Z'],
  triceps: ['M44 122 Q40 136 41 150 Q45 158 51 157 Q57 146 59 132 Q59 116 60 104 Q50 110 44 122 Z'],
  forearms: ['M41 156 Q33 176 30 196 L37 200 Q46 186 53 168 Q56 162 52 158 Q46 160 41 156 Z'],
  'middle back': ['M72 88 Q84 84 90 92 Q95 110 99 128 Q88 126 80 116 Q74 104 72 88 Z'],
  lats: ['M64 104 Q62 128 66 148 Q70 162 78 170 Q86 158 92 146 Q90 132 80 120 Q72 112 64 104 Z'],
  'lower back': ['M100 130 Q92 140 92 150 Q86 162 80 172 Q90 178 100 180 Z'],
  glutes: ['M100 182 Q88 176 74 180 Q64 192 64 210 Q68 226 84 228 Q96 226 100 218 Z'],
  abductors: ['M68 176 Q62 186 62 200 Q64 190 72 182 Z'],
  hamstrings: ['M66 228 Q62 252 66 276 Q70 290 76 292 Q80 280 82 268 Q86 280 90 288 Q94 266 95 244 Q96 232 92 228 Q80 234 66 228 Z'],
  calves: ['M68 300 Q62 318 64 336 Q68 352 76 354 Q80 344 80 336 Q82 346 86 352 Q90 336 89 318 Q86 304 80 300 Q74 302 68 300 Z'],
};
const BACK_DECOR = ['M100 182 L100 222', 'M80 304 Q80 320 80 336'];

function el(tag, attrs = {}) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function bothSides(parent, d, attrs) {
  parent.appendChild(el('path', { d, ...attrs }));
  parent.appendChild(el('path', { d, transform: MIRROR, ...attrs }));
}

/**
 * يرسم خريطة الجسم.
 * @param {'front'|'back'} side
 * @param {{interactive?: boolean, selected?: Set<string>}} opts
 */
export function renderBody(side, opts = {}) {
  const { interactive = true, selected = new Set() } = opts;
  const svg = el('svg', { viewBox: '0 0 200 440', class: 'body-svg', role: 'img',
    'aria-label': side === 'front' ? 'الجسم من الأمام' : 'الجسم من الخلف' });
  const base = side === 'front' ? FRONT_BASE : BACK_BASE;
  const parts = side === 'front' ? FRONT : BACK;
  const decor = side === 'front' ? FRONT_DECOR : BACK_DECOR;

  // طبقتان: حدود سميكة ثم تعبئة بلا حدود تخفي خط التماثل في المنتصف
  const outline = el('g', { class: 'silhouette-outline' });
  const fill = el('g', { class: 'silhouette' });
  base.forEach((d) => { bothSides(outline, d, {}); bothSides(fill, d, {}); });
  svg.appendChild(outline);
  svg.appendChild(fill);
  const headG = el('g', { class: 'head' });
  headG.appendChild(el('ellipse', { cx: 100, cy: 32, rx: 18, ry: 25 }));
  svg.appendChild(headG);

  for (const [muscle, paths] of Object.entries(parts)) {
    const mg = el('g', { class: 'muscle' + (selected.has(muscle) ? ' selected' : ''), 'data-m': muscle });
    if (interactive) { mg.setAttribute('tabindex', '0'); mg.setAttribute('role', 'button'); }
    paths.forEach((d) => bothSides(mg, d, {}));
    svg.appendChild(mg);
  }
  const dg = el('g', { class: 'decor' });
  decor.forEach((d) => bothSides(dg, d, {}));
  if (side === 'back') {
    // خطوط الشعر من الخلف
    dg.appendChild(el('path', { d: 'M88 18 Q100 12 112 18 M86 26 Q100 20 114 26' }));
  }
  svg.appendChild(dg);
  return svg;
}

export const MUSCLES_BY_SIDE = {
  front: Object.keys(FRONT),
  back: Object.keys(BACK),
};
