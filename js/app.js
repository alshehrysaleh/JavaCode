import { renderBody, MUSCLES_BY_SIDE } from './bodymap.js';
import { db, uid, dateKey } from './store.js';
import { MUSCLE_AR, EQUIPMENT_AR, LEVEL_AR, CATEGORY_AR, mAr, eqAr } from './labels.js';
import { loadExercises, ex, forMuscles, search, mediaEl, clearGifCache } from './exercises.js';

/* ============ أدوات DOM ============ */
function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return n;
}
/** يستبدل محتوى العقدة مع تسطيح المصفوفات وتجاهل القيم الفارغة */
function put(node, ...kids) {
  node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)
    .map((k) => (k instanceof Node ? k : document.createTextNode(String(k)))));
}
const $view = () => document.getElementById('view');
const go = (hash) => { location.hash = hash; };
const fmtNum = (n) => new Intl.NumberFormat('ar-SA-u-nu-latn').format(n);

function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2300);
}

function header(title, { back = true, right = null } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': 'رجوع', onclick: () => history.length > 1 ? history.back() : go('#/home') }, icon('back')) : h('span'),
    h('h1', {}, title),
    right || h('span', { class: 'icon-btn ghost' }));
}

function icon(name) {
  const P = {
    back: 'M9 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6',
    check: 'M5 12l5 5 9-10',
    edit: 'M4 20h4L19 9l-4-4L4 16v4z',
    play: 'M8 5l11 7-11 7z',
    x: 'M6 6l12 12M18 6L6 18',
    search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4',
    flip: 'M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5M18 3v4h-4M6 21v-4h4',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', P[name]);
  svg.append(p);
  return svg;
}

/* ============ ورقة منبثقة (Sheet) ============ */
function openSheet(content, { title = '', onClose } = {}) {
  const close = () => { back.remove(); onClose && onClose(); };
  const back = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' },
        h('h2', {}, title),
        h('button', { class: 'icon-btn', 'aria-label': 'إغلاق', onclick: close }, icon('x'))),
      h('div', { class: 'sheet-body' }, content)));
  document.body.append(back);
  return close;
}

/* ============ 1) الرئيسية: خريطة الجسم ============ */
const home = { side: 'front', selected: new Set() };

function viewHome() {
  const v = $view();
  const sideName = home.side === 'front' ? 'أمامي' : 'خلفي';
  const plansCount = db.state.plans.length;

  const bodyWrap = h('div', { class: 'body-wrap' });
  const mini = h('button', { class: 'mini-body', 'aria-label': 'قلب الجسم', onclick: flip });
  const bar = h('div', { class: 'select-bar' });

  function flip() { home.side = home.side === 'front' ? 'back' : 'front'; render(); }

  function render() {
    put(bodyWrap, renderBody(home.side, { selected: home.selected }));
    put(mini, renderBody(home.side === 'front' ? 'back' : 'front', { interactive: false }), h('span', {}, icon('flip')));
    sideBtn.lastChild.textContent = home.side === 'front' ? 'أمامي' : 'خلفي';
    renderBar();
  }

  function renderBar() {
    const sel = [...home.selected];
    bar.classList.toggle('show', sel.length > 0);
    put(bar, 
      h('div', { class: 'chips' }, sel.map((m) => h('button', { class: 'chip on', onclick: () => toggle(m) }, mAr(m)))),
      h('div', { class: 'bar-actions' },
        h('button', { class: 'icon-btn sm', 'aria-label': 'مسح الاختيار', onclick: () => { home.selected.clear(); render(); } }, icon('x')),
        h('button', { class: 'btn primary flip-x', onclick: () => go('#/train/' + sel.join(',')) }, 'ابدأ', icon('back'))));
  }

  function toggle(m) {
    home.selected.has(m) ? home.selected.delete(m) : home.selected.add(m);
    render();
  }

  bodyWrap.addEventListener('click', (e) => {
    const g = e.target.closest('.muscle');
    if (g) toggle(g.dataset.m);
  });
  bodyWrap.addEventListener('keydown', (e) => {
    const g = e.target.closest('.muscle');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(g.dataset.m); }
  });

  const sideBtn = h('button', { class: 'pill', onclick: flip }, icon('flip'), h('span', {}, sideName));

  put(v, 
    h('div', { class: 'home' },
      h('div', { class: 'home-top' },
        sideBtn,
        h('div', { class: 'hint' }, 'اضغط على العضلة (أو عدة عضلات)'),
        h('button', { class: 'pill', onclick: () => go('#/plans') }, 'خططي', plansCount ? h('b', { class: 'badge' }, plansCount) : null)),
      bodyWrap,
      mini,
      bar));
  render();
}

/* ============ 2) صفحة التمرين للعضلات المختارة ============ */
function viewTrain(musclesStr) {
  const muscles = musclesStr.split(',').filter((m) => MUSCLE_AR[m]);
  if (!muscles.length) return go('#/home');
  muscles.forEach((m) => home.selected.add(m));
  const plans = db.plansForMuscles(muscles);
  const suggestions = applyPrefs(forMuscles(muscles)).items.slice(0, 8);
  const sugSection = h('section', { class: 'sug' });

  put($view(), 
    header(muscles.map(mAr).join(' + ')),
    h('main', { class: 'page' },
      plans.length
        ? h('section', {},
            h('h2', { class: 'sec' }, 'خططك المحفوظة'),
            plans.map(planCard),
            h('button', { class: 'btn outline block', onclick: () => newPlan(muscles) }, icon('plus'), 'خطة جديدة لهذه العضلات'))
        : h('section', { class: 'empty' },
            h('div', { class: 'empty-ic' }, '🏋️'),
            h('h2', {}, 'لا يوجد تمرين محفوظ لهذه العضلات بعد'),
            h('p', {}, 'خطّط تمرينك الآن: اختر التمارين من المستودع وحدد عدد الجولات والتكرارات، وستجدها هنا في المرة القادمة.'),
            h('button', { class: 'btn primary block', onclick: () => newPlan(muscles) }, icon('plus'), 'خطّط تمرينًا لهذه العضلات')),
      sugSection));
  function drawSug() {
    put(sugSection,
      h('div', { class: 'sec-row' },
        h('h2', { class: 'sec' }, 'تمارين مقترحة'),
        h('a', { href: '#/library?m=' + muscles[0], class: 'link' }, 'كل التمارين')),
      viewSwitch(drawSug),
      exCollection(suggestions, { onOpen: (e) => go('#/ex/' + e.id) }));
  }
  drawSug();
}

function planCard(p) {
  return h('div', { class: 'card plan' },
    h('div', { class: 'plan-main', onclick: () => go('#/plan/' + p.id) },
      h('h3', {}, p.name),
      h('p', { class: 'muted' }, p.muscles.map(mAr).join('، '), ' · ', fmtNum(p.exercises.length), ' تمارين')),
    h('div', { class: 'plan-actions' },
      h('button', { class: 'icon-btn', 'aria-label': 'تعديل', onclick: () => go('#/plan/' + p.id) }, icon('edit')),
      h('button', { class: 'btn primary sm', onclick: () => startSession(p.id), disabled: !p.exercises.length }, icon('play'), 'ابدأ')));
}

/** اسم التمرين: الإنجليزي أولًا ثم الترجمة العربية */
function exNames(e, { tag = 'div', num = null } = {}) {
  return h(tag, { class: 'names' },
    h('div', { class: 'en', dir: 'ltr' }, num != null ? fmtNum(num) + '. ' : '', e.name),
    e.ar ? h('div', { class: 'ar' }, e.ar) : null);
}

/* ===== تفضيلات العرض: المفضلة أولًا، الأجهزة فقط، إخفاء التمارين المتقدمة ===== */
const ADVANCED_CATS = new Set(['stretching', 'olympic weightlifting', 'strongman']);
const GYM_EQUIP = new Set(['machine', 'cable']);

/** يطبّق التفضيلات على قائمة تمارين ويعيد عدد المخفي */
function applyPrefs(items, f = {}) {
  if (f.machines) items = items.filter((e) => GYM_EQUIP.has(e.equipment));
  if (f.fav) items = items.filter((e) => db.isFav(e.id));
  let hidden = 0;
  if (!db.settings.showAdvanced && !f.q && !f.fav) {
    const n = items.length;
    items = items.filter((e) => !ADVANCED_CATS.has(e.category));
    hidden = n - items.length;
  }
  // المفضلة أولًا مع الحفاظ على الترتيب
  items = [...items.filter((e) => db.isFav(e.id)), ...items.filter((e) => !db.isFav(e.id))];
  return { items, hidden };
}

function findExercises(f) {
  const base = f.muscle && !f.q && !f.equipment ? forMuscles([f.muscle]) : search(f.q, f);
  return applyPrefs(base, f);
}

/** سطر العدد + تنبيه التمارين المخفية مع زر إظهارها */
function resultsLine(total, hidden, extra, onChange) {
  return h('div', { class: 'results-line' },
    h('p', { class: 'muted small' }, fmtNum(total), ' تمرين', extra || ''),
    hidden ? h('button', { class: 'link-btn', onclick: () => { db.setSetting('showAdvanced', true); onChange(); } },
      '+ ', fmtNum(hidden), ' إطالة/أولمبي مخفية — إظهار') : null,
    !hidden && db.settings.showAdvanced ? h('button', { class: 'link-btn', onclick: () => { db.setSetting('showAdvanced', false); onChange(); } },
      'إخفاء الإطالات والأولمبي') : null);
}

/* ===== طرق العرض: شبكة صور / بطاقات كبيرة / قائمة ===== */
const VIEWS = [
  ['grid', 'شبكة', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  ['cards', 'بطاقات', 'M4 4h16v11H4zM4 18h16'],
  ['list', 'قائمة', 'M4 5h4v4H4zM11 7h9M4 15h4v4H4zM11 17h9'],
];

function viewSwitch(onChange) {
  const wrap = h('div', { class: 'view-switch', role: 'group', 'aria-label': 'طريقة العرض' });
  const draw = () => put(wrap, VIEWS.map(([id, label, d]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ic');
    svg.innerHTML = `<path d="${d}"/>`;
    return h('button', { class: db.settings.view === id ? 'on' : '', 'aria-label': label, title: label,
      onclick: () => { db.setSetting('view', id); draw(); onChange(); } }, svg, h('span', {}, label));
  }));
  draw();
  return wrap;
}

/**
 * يعرض مجموعة تمارين بالطريقة المختارة.
 * selectable: النقر على الصورة يختار التمرين، وزر (i) يعرض الحركة والتفاصيل.
 */
function exCollection(items, { chosen = null, onToggle, onOpen } = {}) {
  const mode = db.settings.view || 'grid';
  return h('div', { class: 'ex-col ex-' + mode }, items.map((e) => exItem(e, mode, { chosen, onToggle, onOpen })));
}

function exItem(e, mode, { chosen, onToggle, onOpen }) {
  const selectable = !!chosen;
  const isOn = () => selectable && chosen.has(e.id);
  const mark = selectable ? h('span', { class: 'pick-mark', 'aria-hidden': 'true' }, icon('check')) : null;
  const info = h('button', { class: 'info-btn', 'aria-label': 'عرض الحركة والتفاصيل',
    onclick: (ev) => { ev.stopPropagation(); showExercise(e, selectable ? { chosen, onToggle: () => { toggle(); } } : {}); } }, 'i');
  const star = h('button', { class: 'star-btn' + (db.isFav(e.id) ? ' on' : ''), 'aria-label': 'المفضلة',
    'aria-pressed': String(db.isFav(e.id)),
    onclick: (ev) => {
      ev.stopPropagation();
      const on = db.toggleFav(e.id);
      star.classList.toggle('on', on);
      star.setAttribute('aria-pressed', String(on));
      toast(on ? '★ أُضيف إلى المفضلة' : 'أُزيل من المفضلة');
    } }, '★');
  const tags = h('div', { class: 'tags' },
    e.primary.map((m) => h('span', { class: 'tag m' }, mAr(m))),
    h('span', { class: 'tag' }, eqAr(e.equipment)));
  const media = mediaEl(e, { small: true });
  const el = h('div', { class: 'ex-item' + (isOn() ? ' on' : ''), role: 'button', tabindex: '0',
    'aria-pressed': selectable ? String(isOn()) : null,
    onclick: () => (selectable ? toggle() : onOpen ? onOpen(e) : showExercise(e)),
    onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); } } },
    h('div', { class: 'ex-media' }, media, mark, info, star),
    h('div', { class: 'ex-info' }, exNames(e), mode !== 'grid' ? tags : null));
  function toggle() {
    chosen.has(e.id) ? chosen.delete(e.id) : chosen.add(e.id);
    el.classList.toggle('on', chosen.has(e.id));
    el.setAttribute('aria-pressed', String(chosen.has(e.id)));
    onToggle && onToggle(e);
  }
  return el;
}

/* ============ قائمة الخطط ============ */
function viewPlans() {
  const plans = [...db.state.plans].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  put($view(), 
    header('خططي'),
    h('main', { class: 'page' },
      plans.length ? plans.map(planCard)
        : h('section', { class: 'empty' }, h('h2', {}, 'لا توجد خطط بعد'),
            h('p', {}, 'ابدأ من الرئيسية: اختر العضلة ثم خطّط تمرينك.'),
            h('button', { class: 'btn primary block', onclick: () => go('#/home') }, 'إلى خريطة الجسم'))));
}

/* ============ 3) محرر الخطة + مستودع التمارين ============ */
let draft = null;

function newPlan(muscles) {
  draft = {
    id: uid(), isNew: true,
    name: 'تمرين ' + muscles.map(mAr).map((s) => s.split(' ')[0]).join(' و'),
    muscles: [...muscles], exercises: [],
  };
  go('#/plan/' + draft.id);
  // افتح المستودع مباشرة لاختيار التمارين
  setTimeout(() => openPicker(), 50);
}

function viewPlan(id) {
  if (!draft || draft.id !== id) {
    const p = db.plan(id);
    if (!p) return go('#/home');
    draft = JSON.parse(JSON.stringify(p));
  }
  const d = draft;
  const s = db.settings;

  const list = h('div', { class: 'plan-list' });
  const startBtn = h('button', { class: 'btn primary grow', onclick: () => { savePlan(); startSession(d.id); } }, icon('play'), 'حفظ وابدأ');
  const renderList = () => {
    startBtn.disabled = !d.exercises.length;
    put(list, 
      d.exercises.length ? null : h('p', { class: 'muted center' }, 'لم تُضف تمارين بعد.'),
      d.exercises.map((it, i) => {
        const e = ex(it.exId);
        if (!e) return null;
        return h('div', { class: 'card pe' },
          h('div', { class: 'pe-top' },
            h('span', { class: 'num' }, fmtNum(i + 1)),
            h('button', { class: 'pe-thumb', 'aria-label': 'عرض الحركة', onclick: () => showExercise(e) }, mediaEl(e, { small: true })),
            h('div', { class: 'pe-name', onclick: () => showExercise(e) }, exNames(e)),
            h('div', { class: 'pe-ctl' },
              h('button', { class: 'icon-btn sm', disabled: i === 0, onclick: () => { move(i, -1); } }, icon('up')),
              h('button', { class: 'icon-btn sm', disabled: i === d.exercises.length - 1, onclick: () => { move(i, 1); } }, icon('down')),
              h('button', { class: 'icon-btn sm danger', onclick: () => { d.exercises.splice(i, 1); renderList(); } }, icon('trash')))),
          h('div', { class: 'pe-steppers' },
            stepper('الجولات', it.sets, 1, 10, (v) => { it.sets = v; }),
            stepper('التكرار', it.reps, 1, 50, (v) => { it.reps = v; })));
      }));
  };
  const move = (i, dir) => {
    const [x] = d.exercises.splice(i, 1);
    d.exercises.splice(i + dir, 0, x);
    renderList();
  };

  const musclesRow = h('div', { class: 'chips wrap' });
  const renderMuscles = () => put(musclesRow, 
    Object.keys(MUSCLE_AR).map((m) => h('button', {
      class: 'chip' + (d.muscles.includes(m) ? ' on' : ''),
      onclick: () => {
        d.muscles = d.muscles.includes(m) ? d.muscles.filter((x) => x !== m) : [...d.muscles, m];
        renderMuscles();
      },
    }, mAr(m))));

  put($view(), 
    header(d.isNew ? 'خطة جديدة' : 'تعديل الخطة'),
    h('main', { class: 'page' },
      h('label', { class: 'field' }, h('span', {}, 'اسم الخطة'),
        h('input', { type: 'text', value: d.name, oninput: (e) => { d.name = e.target.value; } })),
      h('details', { class: 'field' }, h('summary', {}, 'العضلات المستهدفة: ', h('b', {}, d.muscles.map(mAr).join('، ') || '—')), musclesRow),
      h('div', { class: 'sec-row' }, h('h2', { class: 'sec' }, 'التمارين'),
        h('button', { class: 'btn outline sm', onclick: openPicker }, icon('plus'), 'إضافة من المستودع')),
      list,
      h('div', { class: 'sticky-actions' },
        !d.isNew ? h('button', { class: 'btn ghost danger', onclick: () => {
          if (confirm('حذف هذه الخطة؟')) { db.deletePlan(d.id); draft = null; history.back(); }
        } }, icon('trash')) : null,
        h('button', { class: 'btn outline', onclick: () => { savePlan(); toast('تم الحفظ'); } }, 'حفظ'),
        startBtn)));
  renderList();
  renderMuscles();
  viewPlan.refresh = renderList;

  function savePlan() {
    if (!d.name.trim()) d.name = 'خطة بدون اسم';
    const { isNew, ...plan } = d;
    db.upsertPlan(JSON.parse(JSON.stringify(plan)));
    d.isNew = false;
  }

  function stepper(label, val, min, max, set) {
    const out = h('b', {}, fmtNum(val));
    const upd = (dv) => { val = Math.min(max, Math.max(min, val + dv)); out.textContent = fmtNum(val); set(val); };
    return h('div', { class: 'stepper' }, h('span', { class: 'muted' }, label),
      h('button', { class: 'icon-btn sm', onclick: () => upd(-1) }, '−'), out,
      h('button', { class: 'icon-btn sm', onclick: () => upd(1) }, '+'));
  }
}

/** مستودع التمارين في وضع الاختيار لإضافتها للخطة */
function openPicker() {
  const d = draft;
  if (!d) return;
  const chosen = new Set(d.exercises.map((x) => x.exId));
  const filters = { q: '', muscle: d.muscles[0] || '', equipment: '', machines: false, fav: false };
  const listEl = h('div', { class: 'list' });
  const count = h('b', {}, fmtNum(chosen.size));
  const updCount = () => { count.textContent = fmtNum(chosen.size); };

  const renderList = () => {
    const { items: all, hidden } = findExercises(filters);
    const items = all.slice(0, 80);
    put(listEl,
      resultsLine(all.length, hidden, ' · اضغط الصورة للاختيار، وزر (i) لمشاهدة الحركة', renderList),
      items.length ? exCollection(items, { chosen, onToggle: updCount }) : emptyResults(filters));
  };

  const content = h('div', {},
    libraryFilters(filters, renderList, d.muscles, viewSwitch(() => renderList())),
    listEl,
    h('div', { class: 'sheet-foot' },
      h('button', { class: 'btn primary block', onclick: () => close() }, 'إضافة المختار (', count, ')')));

  const close = openSheet(content, { title: 'مستودع التمارين', onClose: () => {
    const keep = d.exercises.filter((x) => chosen.has(x.exId));
    const have = new Set(keep.map((x) => x.exId));
    for (const id of chosen) if (!have.has(id)) keep.push({ exId: id, sets: db.settings.defaultSets, reps: db.settings.defaultReps });
    d.exercises = keep;
    viewPlan.refresh && viewPlan.refresh();
  } });
  renderList();
}

function libraryFilters(filters, onChange, preferMuscles = [], trailing = null) {
  const muscleOrder = [...new Set([...preferMuscles, ...Object.keys(MUSCLE_AR)])];
  let t;
  return h('div', { class: 'filters' },
    h('label', { class: 'search' }, icon('search'),
      h('input', { type: 'search', placeholder: 'ابحث باسم التمرين (عربي أو إنجليزي)', value: filters.q,
        oninput: (e) => { filters.q = e.target.value; clearTimeout(t); t = setTimeout(onChange, 200); } })),
    h('div', { class: 'chips scroll' },
      h('button', { class: 'chip' + (!filters.muscle ? ' on' : ''), onclick: pick('') }, 'الكل'),
      muscleOrder.map((m) => h('button', { class: 'chip' + (filters.muscle === m ? ' on' : ''), 'data-m': m, onclick: pick(m) }, mAr(m)))),
    h('div', { class: 'chips toggles' },
      toggleChip('★ المفضلة', 'fav'),
      toggleChip('الأجهزة والكيبل فقط', 'machines')),
    h('div', { class: 'filter-row' },
      h('select', { class: 'select', 'aria-label': 'الأداة', onchange: (e) => { filters.equipment = e.target.value; onChange(); } },
        h('option', { value: '' }, 'كل الأدوات'),
        Object.entries(EQUIPMENT_AR).map(([k, v]) => h('option', { value: k, selected: filters.equipment === k }, v))),
      trailing));

  function toggleChip(label, key) {
    const b = h('button', { class: 'chip tgl' + (filters[key] ? ' on' : ''), 'aria-pressed': String(!!filters[key]),
      onclick: () => {
        filters[key] = !filters[key];
        b.classList.toggle('on', filters[key]);
        b.setAttribute('aria-pressed', String(filters[key]));
        onChange();
      } }, label);
    return b;
  }

  function pick(m) {
    return (e) => {
      filters.muscle = m;
      e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.target));
      onChange();
    };
  }
}

/* ============ تبويب التمارين (المستودع) ============ */
const lib = { q: '', muscle: '', equipment: '', machines: false, fav: false };

function viewLibrary(params) {
  if (params.get('m')) lib.muscle = params.get('m');
  const listEl = h('div', { class: 'list' });
  const renderList = () => {
    const { items, hidden } = findExercises(lib);
    const shown = items.slice(0, 100);
    put(listEl,
      resultsLine(items.length, hidden, items.length > 100 ? ' — يُعرض أول ١٠٠' : '', renderList),
      shown.length ? exCollection(shown, { onOpen: (e) => go('#/ex/' + e.id) }) : emptyResults(lib));
  };
  put($view(), 
    header('مستودع التمارين', { back: false }),
    h('main', { class: 'page' }, libraryFilters(lib, renderList, [], viewSwitch(() => renderList())), listEl));
  renderList();
}

function exerciseDetail(e) {
  return h('div', { class: 'ex-detail' },
    mediaEl(e),
    h('div', { class: 'ex-title' }, exNames(e)),
    h('div', { class: 'tags' },
      e.primary.map((m) => h('span', { class: 'tag m' }, mAr(m))),
      e.secondary.map((m) => h('span', { class: 'tag m2' }, mAr(m))),
      h('span', { class: 'tag' }, eqAr(e.equipment)),
      e.level && h('span', { class: 'tag' }, LEVEL_AR[e.level] || e.level),
      e.category && h('span', { class: 'tag' }, CATEGORY_AR[e.category] || e.category)),
    favButton(e),
    h('h3', { class: 'sec' }, 'طريقة الأداء'),
    h('ol', { class: 'steps', dir: 'ltr' }, e.instructions.map((s) => h('li', {}, s))));
}

function favButton(e) {
  const label = () => (db.isFav(e.id) ? '★ في المفضلة (اضغط للإزالة)' : '☆ أضف إلى المفضلة');
  const b = h('button', { class: 'btn sm fav-btn' + (db.isFav(e.id) ? ' on' : ''), onclick: () => {
    const on = db.toggleFav(e.id);
    b.classList.toggle('on', on);
    b.textContent = label();
  } }, label());
  return b;
}

function emptyResults(f) {
  return h('div', { class: 'empty' },
    h('h2', {}, f.fav ? 'لا توجد تمارين مفضلة هنا بعد' : 'لا توجد نتائج'),
    h('p', {}, f.fav ? 'اضغط النجمة ★ على صورة أي تمرين ليظهر هنا وفي أعلى القوائم دائمًا.' : 'جرّب إزالة بعض الفلاتر أو تغيير كلمة البحث.'));
}

function showExercise(e, { chosen = null, onToggle } = {}) {
  let close;
  const content = h('div', {}, exerciseDetail(e));
  if (chosen) {
    const on = chosen.has(e.id);
    content.append(h('div', { class: 'sheet-foot' },
      h('button', { class: 'btn block ' + (on ? 'outline' : 'primary'), onclick: () => { onToggle(); close(); } },
        on ? 'إزالة من الاختيار' : 'اختر هذا التمرين', on ? null : icon('check'))));
  }
  close = openSheet(content, { title: 'تفاصيل التمرين' });
}

function viewExercise(id) {
  const e = ex(id);
  if (!e) return go('#/library');
  put($view(), 
    header('تفاصيل التمرين'),
    h('main', { class: 'page' },
      exerciseDetail(e),
      h('button', { class: 'btn primary block', onclick: () => addToPlanSheet(e) }, icon('plus'), 'أضف إلى خطة')));
}

function addToPlanSheet(e) {
  const plans = db.state.plans;
  let close;
  const content = h('div', {},
    plans.map((p) => h('button', { class: 'row-btn', onclick: () => {
      if (!p.exercises.some((x) => x.exId === e.id)) p.exercises.push({ exId: e.id, sets: db.settings.defaultSets, reps: db.settings.defaultReps });
      db.upsertPlan(p); close(); toast('أُضيف إلى ' + p.name);
    } }, p.name, h('span', { class: 'muted' }, fmtNum(p.exercises.length), ' تمارين'))),
    h('button', { class: 'btn outline block', onclick: () => {
      close();
      draft = { id: uid(), isNew: true, name: 'تمرين ' + mAr(e.primary[0] || 'chest'), muscles: [...e.primary],
        exercises: [{ exId: e.id, sets: db.settings.defaultSets, reps: db.settings.defaultReps }] };
      go('#/plan/' + draft.id);
    } }, icon('plus'), 'خطة جديدة'));
  close = openSheet(content, { title: 'أضف إلى خطة' });
}

/* ============ جلسة التمرين (التسجيل في النادي) ============ */
const ACTIVE_KEY = 'gymapp.active';
const getActive = () => { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY)); } catch { return null; } };
const setActive = (a) => { a ? localStorage.setItem(ACTIVE_KEY, JSON.stringify(a)) : localStorage.removeItem(ACTIVE_KEY); };

function startSession(planId) {
  const p = db.plan(planId);
  if (!p) return;
  const cur = getActive();
  if (cur && cur.planId !== planId && !confirm('لديك تمرين جارٍ لم يُحفظ. هل تريد بدء تمرين جديد بدلًا منه؟')) {
    return go('#/session');
  }
  if (!cur || cur.planId !== planId) {
    setActive({
      id: uid(), planId, name: p.name, muscles: p.muscles, start: Date.now(),
      entries: p.exercises.map((it) => {
        const last = db.lastSetsFor(it.exId);
        return { exId: it.exId, sets: Array.from({ length: it.sets }, (_, i) => ({
          w: last && last[i] ? last[i].w : '', r: last && last[i] ? last[i].r : it.reps, done: false })) };
      }),
    });
  }
  go('#/session');
}

let restTimer = null;
function startRest(sec) {
  stopRest();
  let left = sec;
  const label = h('b', {}, fmtTime(left));
  const box = h('div', { class: 'rest' },
    h('span', {}, 'راحة'), label,
    h('button', { class: 'btn ghost sm', onclick: () => { left += 15; label.textContent = fmtTime(left); } }, '+١٥ث'),
    h('button', { class: 'btn ghost sm', onclick: stopRest }, 'تخطي'));
  document.body.append(box);
  restTimer = { box, id: setInterval(() => {
    left -= 1;
    label.textContent = fmtTime(Math.max(0, left));
    if (left <= 0) { beep(); navigator.vibrate && navigator.vibrate([200, 100, 200]); stopRest(); }
  }, 1000) };
}
function stopRest() { if (restTimer) { clearInterval(restTimer.id); restTimer.box.remove(); restTimer = null; } }
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); o.frequency.value = 880; o.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.35);
  } catch { /* ignore */ }
}

function viewSession() {
  const a = getActive();
  if (!a) {
    put($view(), header('التمرين'), h('main', { class: 'page' },
      h('section', { class: 'empty' }, h('h2', {}, 'لا يوجد تمرين جارٍ'),
        h('button', { class: 'btn primary block', onclick: () => go('#/home') }, 'اختر العضلة من الرئيسية'))));
    return;
  }
  const unit = db.settings.unit;
  const persist = () => setActive(a);
  const elapsed = h('span', { class: 'muted' });
  const tick = setInterval(() => {
    if (!elapsed.isConnected) return clearInterval(tick);
    elapsed.textContent = fmtTime(Math.floor((Date.now() - a.start) / 1000));
  }, 1000);

  const body = h('main', { class: 'page' },
    a.entries.map((en, ei) => {
      const e = ex(en.exId);
      if (!e) return null;
      const rows = h('div', { class: 'sets' });
      const renderSets = () => put(rows, 
        h('div', { class: 'set head' }, h('span', {}, '#'), h('span', {}, 'الوزن (' + (unit === 'kg' ? 'كجم' : 'رطل') + ')'), h('span', {}, 'التكرار'), h('span', {}, '')),
        en.sets.map((s, si) => h('div', { class: 'set' + (s.done ? ' done' : '') },
          h('span', { class: 'num' }, fmtNum(si + 1)),
          h('input', { type: 'number', inputmode: 'decimal', min: 0, step: '0.5', value: s.w, placeholder: '0',
            oninput: (ev) => { s.w = ev.target.value; persist(); } }),
          h('input', { type: 'number', inputmode: 'numeric', min: 0, value: s.r,
            oninput: (ev) => { s.r = ev.target.value; persist(); } }),
          h('button', { class: 'check' + (s.done ? ' on' : ''), 'aria-label': 'تم', onclick: () => {
            s.done = !s.done; persist(); renderSets();
            if (s.done) startRest(db.settings.rest);
          } }, icon('check')))),
        h('div', { class: 'set-actions' },
          h('button', { class: 'btn ghost sm', onclick: () => {
            const prev = en.sets[en.sets.length - 1] || { w: '', r: 10 };
            en.sets.push({ w: prev.w, r: prev.r, done: false }); persist(); renderSets();
          } }, icon('plus'), 'جولة'),
          en.sets.length > 1 ? h('button', { class: 'btn ghost sm', onclick: () => { en.sets.pop(); persist(); renderSets(); } }, '− جولة') : null));
      renderSets();
      return h('div', { class: 'card sx' },
        h('div', { class: 'sx-head', onclick: () => showExercise(e) },
          mediaEl(e, { small: true }),
          h('div', {}, exNames(e, { num: ei + 1 }),
            h('div', { class: 'muted small' }, e.primary.map(mAr).join('، '), ' · اضغط لعرض الحركة'))),
        rows);
    }),
    h('div', { class: 'sticky-actions' },
      h('button', { class: 'btn ghost danger', onclick: () => {
        if (confirm('إلغاء التمرين دون حفظ؟')) { setActive(null); stopRest(); go('#/home'); }
      } }, 'إلغاء'),
      h('button', { class: 'btn primary grow', onclick: finish }, icon('check'), 'إنهاء وحفظ')));

  put($view(), header(a.name, { right: elapsed }), body);

  function finish() {
    const doneSets = a.entries.reduce((n, en) => n + en.sets.filter((s) => s.done).length, 0);
    if (!doneSets && !confirm('لم تُسجّل أي جولة مكتملة. حفظ على أي حال؟')) return;
    stopRest();
    db.addSession({
      id: a.id, planId: a.planId, name: a.name, muscles: a.muscles,
      date: new Date(a.start).toISOString(), localDate: dateKey(new Date(a.start)),
      durationSec: Math.floor((Date.now() - a.start) / 1000),
      entries: a.entries.map((en) => ({ exId: en.exId, sets: en.sets.map((s) => ({ w: +s.w || 0, r: +s.r || 0, done: s.done })) })),
    });
    setActive(null);
    toast('أحسنت! تم حفظ التمرين 💪');
    go('#/calendar');
  }
}

/* ============ تبويب التقويم (عرض أسبوعي: الأحد ← السبت، ميلادي وهجري) ============ */
const sessionDay = (s) => s.localDate || s.date.slice(0, 10);
const fmtG = (o) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', o);
const fmtH = (o) => new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', o);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStartOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); return addDays(x, -x.getDay()); }; // الأحد
const cal = { week: weekStartOf(new Date()), sel: dateKey() };

/** نص نطاق من تاريخين، مع حذف الشهر/السنة المكررة */
function rangeText(fmt, a, b) {
  const pa = Object.fromEntries(fmt({ day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(a).map((p) => [p.type, p.value]));
  const pb = Object.fromEntries(fmt({ day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(b).map((p) => [p.type, p.value]));
  const era = (p) => (p.era ? ' ' + p.era : '');
  if (pa.year !== pb.year) return `${pa.day} ${pa.month} ${pa.year} – ${pb.day} ${pb.month} ${pb.year}${era(pb)}`;
  if (pa.month !== pb.month) return `${pa.day} ${pa.month} – ${pb.day} ${pb.month} ${pb.year}${era(pb)}`;
  return `${pa.day} – ${pb.day} ${pb.month} ${pb.year}${era(pb)}`;
}

function viewCalendar() {
  const byDay = {};
  db.state.sessions.forEach((s) => { (byDay[sessionDay(s)] ||= []).push(s); });
  const today = dateKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(cal.week, i));
  const keys = days.map((d) => dateKey(d));
  const weekSessions = keys.flatMap((k) => byDay[k] || []);
  const isThisWeek = keys.includes(today);
  const doneOn = (k, planId) => (byDay[k] || []).some((s) => s.planId === planId);

  const strip = h('div', { class: 'week-strip' },
    days.map((d, i) => {
      const k = keys[i];
      const planned = db.scheduledFor(k);
      const pending = planned.some((p) => !doneOn(k, p.planId));
      return h('button', {
        class: ['wday', k === today && 'today', k === cal.sel && 'sel', byDay[k] && 'has', pending && 'plan'].filter(Boolean).join(' '),
        onclick: () => { cal.sel = k; viewCalendar(); },
      },
        h('span', { class: 'wd-name' }, fmtG({ weekday: 'short' }).format(d)),
        h('b', { class: 'wd-g' }, fmtG({ day: 'numeric' }).format(d)),
        h('span', { class: 'wd-h' }, fmtH({ day: 'numeric' }).format(d)),
        h('i'));
    }));
  // السحب يمينًا/يسارًا للتنقل بين الأسابيع
  let x0 = null;
  strip.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  strip.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) shift(dx > 0 ? 1 : -1); // في RTL السحب لليمين = الأسبوع التالي
  });

  // برنامج الأسبوع: كل يوم وخططه
  const program = h('div', { class: 'card program' },
    h('div', { class: 'sec-row' },
      h('h2', { class: 'sec' }, 'برنامج الأسبوع'),
      h('button', { class: 'btn outline sm', onclick: () => openWeekPlanner(cal.week, viewCalendar) }, icon('plus'), 'توزيع التمارين')),
    days.map((d, i) => {
      const k = keys[i];
      const planned = db.scheduledFor(k);
      return h('div', { class: 'prog-row' + (k === cal.sel ? ' sel' : '') + (k === today ? ' today' : ''),
        onclick: () => { cal.sel = k; viewCalendar(); } },
        h('div', { class: 'prog-day' }, h('b', {}, fmtG({ weekday: 'long' }).format(d)),
          h('span', {}, fmtG({ day: 'numeric', month: 'short' }).format(d), ' · ', fmtH({ day: 'numeric', month: 'short' }).format(d))),
        h('div', { class: 'prog-plans' },
          planned.length ? planned.map(({ planId, recurring }) => {
            const p = db.plan(planId);
            return h('span', { class: 'pchip' + (doneOn(k, planId) ? ' done' : '') }, doneOn(k, planId) ? '✓ ' : '', recurring ? '🔁 ' : '', p.name);
          }) : h('span', { class: 'muted small' }, 'راحة')),
        h('button', { class: 'icon-btn sm add', 'aria-label': 'إضافة تمرين لهذا اليوم',
          onclick: (ev) => { ev.stopPropagation(); addPlanSheet(k, viewCalendar); } }, icon('plus')));
    }));

  const selDate = new Date(cal.sel + 'T12:00:00');
  const daySessions = byDay[cal.sel] || [];
  const dayPlans = db.scheduledFor(cal.sel);
  const weekLabel = isThisWeek ? 'هذا الأسبوع' : rel();

  put($view(),
    header('التقويم', { back: false, right: h('button', { class: 'icon-btn plus-btn', 'aria-label': 'توزيع التمارين على الأسبوع',
      onclick: () => openWeekPlanner(cal.week, viewCalendar) }, icon('plus')) }),
    h('main', { class: 'page' },
      h('div', { class: 'card week-card' },
        h('div', { class: 'cal-head' },
          h('button', { class: 'icon-btn', 'aria-label': 'الأسبوع السابق', onclick: () => shift(-1) }, icon('back')),
          h('div', { class: 'week-title' },
            h('b', {}, rangeText(fmtG, days[0], days[6])),
            h('span', {}, rangeText(fmtH, days[0], days[6]))),
          h('button', { class: 'icon-btn flip-x', 'aria-label': 'الأسبوع التالي', onclick: () => shift(1) }, icon('back'))),
        strip,
        h('div', { class: 'week-foot' },
          h('span', { class: 'muted small' }, weekLabel),
          !isThisWeek ? h('button', { class: 'btn ghost sm', onclick: () => { cal.week = weekStartOf(new Date()); cal.sel = today; viewCalendar(); } }, 'العودة لليوم') : null,
          h('span', { class: 'legend' }, h('span', { class: 'dot has' }), 'منجز', h('span', { class: 'dot plan' }), 'مجدول'))),
      h('div', { class: 'stats' },
        stat(fmtNum(weekSessions.length), 'تمارين الأسبوع'),
        stat(fmtNum(Math.round(weekSessions.reduce((n, s) => n + s.durationSec, 0) / 60)), 'دقيقة'),
        stat(fmtNum(new Set(weekSessions.flatMap((s) => s.muscles)).size), 'عضلات مُدرَّبة')),
      h('div', { class: 'day-title' },
        h('h2', { class: 'sec' }, fmtG({ weekday: 'long' }).format(selDate), cal.sel === today ? h('span', { class: 'today-tag' }, 'اليوم') : null),
        h('div', { class: 'dates' },
          h('span', {}, fmtG({ day: 'numeric', month: 'long', year: 'numeric' }).format(selDate), ' م'),
          h('span', {}, fmtH({ day: 'numeric', month: 'long', year: 'numeric' }).format(selDate)))),
      dayPlans.map(({ planId, recurring }) => {
        const p = db.plan(planId);
        const done = doneOn(cal.sel, planId);
        return h('div', { class: 'card plan' + (done ? ' done' : '') },
          h('div', { class: 'plan-main' }, h('h3', {}, done ? '✅ ' : '📌 ', p.name),
            h('p', { class: 'muted' }, recurring ? '🔁 كل ' + fmtG({ weekday: 'long' }).format(selDate) : 'لهذا اليوم فقط', ' · ', p.muscles.map(mAr).join('، '))),
          h('div', { class: 'plan-actions' },
            h('button', { class: 'icon-btn danger', 'aria-label': 'إزالة', onclick: () => removePlanFrom(cal.sel, planId, recurring, viewCalendar) }, icon('x')),
            done ? h('span', { class: 'done-tag' }, 'أُنجز') : h('button', { class: 'btn primary sm', onclick: () => startSession(p.id) }, icon('play'), 'ابدأ')));
      }),
      daySessions.map(sessionCard),
      !daySessions.length && !dayPlans.length ? h('p', { class: 'muted center' }, 'لا يوجد تمرين في هذا اليوم') : null,
      h('button', { class: 'btn outline block', onclick: () => addPlanSheet(cal.sel, viewCalendar) }, icon('plus'), 'إضافة تمرين لهذا اليوم'),
      program));

  function rel() {
    const diff = Math.round((cal.week - weekStartOf(new Date())) / (7 * 864e5));
    const n = Math.abs(diff);
    const w = n === 1 ? 'أسبوع' : n === 2 ? 'أسبوعين' : `${fmtNum(n)} أسابيع`;
    return diff < 0 ? `قبل ${w}` : `بعد ${w}`;
  }
  function shift(d) {
    cal.week = addDays(cal.week, 7 * d);
    // نقل اليوم المختار إلى نفس اليوم في الأسبوع الجديد
    cal.sel = dateKey(addDays(new Date(cal.sel + 'T12:00:00'), 7 * d));
    viewCalendar();
  }
}

/* ===== جدولة الخطط على أيام الأسبوع ===== */
let repeatWeekly = true; // آخر اختيار للمستخدم

function removePlanFrom(k, planId, recurring, done) {
  if (recurring) {
    const dow = new Date(k + 'T12:00:00').getDay();
    const day = fmtG({ weekday: 'long' }).format(new Date(k + 'T12:00:00'));
    if (!confirm(`هذه الخطة متكررة كل ${day}. إزالتها من البرنامج الأسبوعي؟`)) return;
    db.removeWeekly(dow, planId);
  } else {
    db.unschedule(k, planId);
  }
  done();
}

/** ورقة اختيار خطة لإضافتها إلى يوم، مع خيار التكرار الأسبوعي */
function addPlanSheet(k, done) {
  const date = new Date(k + 'T12:00:00');
  const dayName = fmtG({ weekday: 'long' }).format(date);
  let close;
  if (!db.state.plans.length) {
    close = openSheet(h('div', { class: 'empty' },
      h('h2', {}, 'لا توجد خطط بعد'),
      h('p', {}, 'أنشئ خطة أولًا: اختر العضلة من الرئيسية ثم «خطّط تمرينًا»، وبعدها وزّعها على أيام الأسبوع.'),
      h('button', { class: 'btn primary block', onclick: () => { close(); go('#/home'); } }, 'إلى خريطة الجسم')), { title: 'إضافة تمرين' });
    return;
  }
  const existing = new Set(db.scheduledFor(k).map((p) => p.planId));
  const seg = h('div', { class: 'seg wide' });
  const drawSeg = () => put(seg,
    h('button', { class: repeatWeekly ? 'on' : '', onclick: () => { repeatWeekly = true; drawSeg(); } }, '🔁 كل ', dayName),
    h('button', { class: !repeatWeekly ? 'on' : '', onclick: () => { repeatWeekly = false; drawSeg(); } }, 'هذا اليوم فقط'));
  drawSeg();
  close = openSheet(h('div', {},
    h('p', { class: 'muted small' }, dayName, ' ', fmtG({ day: 'numeric', month: 'long' }).format(date), ' · ', fmtH({ day: 'numeric', month: 'long' }).format(date)),
    seg,
    db.state.plans.map((p) => h('button', { class: 'row-btn' + (existing.has(p.id) ? ' added' : ''), disabled: existing.has(p.id), onclick: () => {
      if (repeatWeekly) db.addWeekly(date.getDay(), p.id, k); else db.schedule(k, p.id);
      close(); toast('أُضيفت ' + p.name + (repeatWeekly ? ' — كل ' + dayName : '')); done();
    } }, h('span', {}, p.name), h('span', { class: 'muted' }, existing.has(p.id) ? 'مضافة' : p.muscles.map(mAr).join('، '))))),
  { title: 'إضافة تمرين' });
}

/** محرر توزيع الخطط على أيام الأسبوع (الأحد ← السبت) */
function openWeekPlanner(weekStart, done) {
  const body = h('div', { class: 'planner' });
  const draw = () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    put(body,
      h('p', { class: 'muted small' }, 'اضغط ＋ بجانب اليوم لإضافة خطة. 🔁 تعني أنها تتكرر كل أسبوع.'),
      days.map((d) => {
        const k = dateKey(d);
        const planned = db.scheduledFor(k);
        return h('div', { class: 'pl-row' },
          h('div', { class: 'prog-day' }, h('b', {}, fmtG({ weekday: 'long' }).format(d)),
            h('span', {}, fmtG({ day: 'numeric', month: 'short' }).format(d), ' · ', fmtH({ day: 'numeric', month: 'short' }).format(d))),
          h('div', { class: 'prog-plans' },
            planned.length ? planned.map(({ planId, recurring }) => h('span', { class: 'pchip' },
              recurring ? '🔁 ' : '', db.plan(planId).name,
              h('button', { class: 'pchip-x', 'aria-label': 'إزالة', onclick: () => removePlanFrom(k, planId, recurring, draw) }, '×')))
              : h('span', { class: 'muted small' }, 'راحة')),
          h('button', { class: 'icon-btn sm add', 'aria-label': 'إضافة', onclick: () => addPlanSheet(k, draw) }, icon('plus')));
      }),
      h('div', { class: 'sheet-foot' }, h('button', { class: 'btn primary block', onclick: () => close() }, 'تم')));
  };
  const close = openSheet(body, { title: 'توزيع التمارين على الأسبوع', onClose: done });
  draw();
}

function stat(v, l) { return h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)); }

function sessionCard(s) {
  const unit = db.settings.unit === 'kg' ? 'كجم' : 'رطل';
  const vol = s.entries.reduce((n, en) => n + en.sets.filter((x) => x.done).reduce((m, x) => m + x.w * x.r, 0), 0);
  const sets = s.entries.reduce((n, en) => n + en.sets.filter((x) => x.done).length, 0);
  return h('details', { class: 'card session' },
    h('summary', {},
      h('div', {}, h('h3', {}, '✅ ', s.name),
        h('p', { class: 'muted' }, fmtNum(Math.round(s.durationSec / 60)), ' دقيقة · ', fmtNum(sets), ' جولة · ', fmtNum(Math.round(vol)), ' ', unit, ' حجم'))),
    s.entries.map((en) => {
      const e = ex(en.exId);
      const done = en.sets.filter((x) => x.done);
      return h('div', { class: 'sess-ex' },
        e ? exNames(e) : h('div', { class: 'en', dir: 'ltr' }, en.exId),
        h('div', { class: 'muted small' }, done.length ? done.map((x) => `${fmtNum(x.w)}×${fmtNum(x.r)}`).join('  ·  ') : 'لم يُنجز'));
    }),
    h('button', { class: 'btn ghost danger sm', onclick: () => { if (confirm('حذف هذا السجل؟')) { db.deleteSession(s.id); viewCalendar(); } } }, icon('trash'), 'حذف السجل'));
}

/* ============ تبويب الإعدادات ============ */
function viewSettings() {
  const s = db.settings;
  const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, l]) =>
    h('button', { class: s[key] === v ? 'on' : '', onclick: () => { db.setSetting(key, v); viewSettings(); } }, l)));
  const num = (key, min, max, step) => h('input', { type: 'number', class: 'num-in', min, max, step, value: s[key],
    onchange: (e) => { const v = Math.min(max, Math.max(min, +e.target.value || min)); db.setSetting(key, v); e.target.value = v; } });

  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { db.importJSON(await f.text()); toast('تم استيراد البيانات'); viewSettings(); } catch (err) { alert('تعذر الاستيراد: ' + err.message); }
  } });

  put($view(), 
    header('الإعدادات', { back: false }),
    h('main', { class: 'page' },
      h('div', { class: 'card settings' },
        h('div', { class: 'set-row' }, h('span', {}, 'وحدة الوزن'), seg('unit', [['kg', 'كجم'], ['lb', 'رطل']])),
        h('div', { class: 'set-row' }, h('span', {}, 'مدة الراحة بين الجولات (ثانية)'), num('rest', 15, 600, 15)),
        h('div', { class: 'set-row' }, h('div', {}, h('span', {}, 'إظهار الإطالات والتمارين الأولمبية'),
          h('p', { class: 'muted small' }, 'مخفية افتراضيًا لتقليل الخيارات؛ تظهر دائمًا عند البحث بالاسم.')),
          seg('showAdvanced', [[true, 'إظهار'], [false, 'إخفاء']])),
        h('div', { class: 'set-row' }, h('span', {}, 'طريقة عرض التمارين'), seg('view', [['grid', 'شبكة'], ['cards', 'بطاقات'], ['list', 'قائمة']])),
        h('div', { class: 'set-row' }, h('span', {}, 'الجولات الافتراضية'), num('defaultSets', 1, 10, 1)),
        h('div', { class: 'set-row' }, h('span', {}, 'التكرارات الافتراضية'), num('defaultReps', 1, 50, 1)),
        h('div', { class: 'set-row' }, h('div', {}, h('span', {}, 'صور GIF متحركة من الإنترنت'),
          h('p', { class: 'muted small' }, 'عند تعطيلها أو تعذّرها تُعرض صورتا الحركة بالتناوب.')),
          seg('gif', [[true, 'تشغيل'], [false, 'إيقاف']]))),
      h('h2', { class: 'sec' }, 'البيانات'),
      h('div', { class: 'card settings' },
        h('p', { class: 'muted small' }, 'بياناتك محفوظة على هذا الجهاز فقط: ',
          fmtNum(db.state.plans.length), ' خطة، ', fmtNum(db.state.sessions.length), ' تمرين مسجّل.'),
        h('button', { class: 'btn outline block', onclick: exportData }, 'تصدير نسخة احتياطية (JSON)'),
        h('button', { class: 'btn outline block', onclick: () => fileIn.click() }, 'استيراد نسخة احتياطية'), fileIn,
        h('button', { class: 'btn ghost block', onclick: () => { clearGifCache(); toast('تم مسح ذاكرة الصور'); } }, 'مسح ذاكرة صور GIF'),
        h('button', { class: 'btn ghost danger block', onclick: () => {
          if (confirm('حذف جميع الخطط والسجلات نهائيًا؟')) { db.reset(); setActive(null); toast('تم الحذف'); viewSettings(); }
        } }, 'حذف جميع البيانات')),
      h('p', { class: 'muted small center' },
        'مستودع التمارين: Free Exercise DB (ملكية عامة) — ', fmtNum(876), ' تمرين. صور GIF الاختيارية من ExerciseDB.')));

  function exportData() {
    const blob = new Blob([db.exportJSON()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `gym-backup-${dateKey()}.json` });
    document.body.append(a); a.click(); a.remove();
  }
}

/* ============ الموجّه وشريط التبويبات ============ */
const TABS = [
  { id: 'home', label: 'الرئيسية', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { id: 'calendar', label: 'التقويم', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0' },
  { id: 'library', label: 'التمارين', icon: 'M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12' },
  { id: 'settings', label: 'الإعدادات', icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1-3-2 .2-1.5-1.5L17 5l-3-1-1 2h-2l-1-2-3 1 .5 1.7L6 8.2 4 8l-1 3 2 1v0l-2 1 1 3 2-.2 1.5 1.5L7 19l3 1 1-2h2l1 2 3-1-.5-1.7 1.5-1.5 2 .2 1-3z' },
];
const TAB_OF = { home: 'home', train: 'home', plans: 'home', plan: 'home', session: 'home', calendar: 'calendar', library: 'library', ex: 'library', settings: 'settings' };

function renderTabs(active) {
  const nav = document.getElementById('tabs');
  const live = getActive();
  put(nav, ...TABS.map((t) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = `<path d="${t.icon}"/>`;
    return h('a', { href: '#/' + t.id, class: 'tab' + (t.id === active ? ' on' : '') }, svg, h('span', {}, t.label));
  }));
  // شريط "تمرين جارٍ" للعودة السريعة
  document.getElementById('live')?.remove();
  if (live && !location.hash.startsWith('#/session')) {
    nav.before(h('a', { id: 'live', href: '#/session', class: 'live' }, '● تمرين جارٍ: ', live.name, ' — عُد إليه'));
  }
}

function route() {
  stopRestIfLeaving();
  const raw = location.hash.slice(2) || 'home';
  const [path, qs] = raw.split('?');
  const [name, arg] = path.split('/').map(decodeURIComponent);
  const params = new URLSearchParams(qs || '');
  document.querySelectorAll('.sheet-backdrop').forEach((s) => s.remove());
  renderTabs(TAB_OF[name] || 'home');
  window.scrollTo(0, 0);
  switch (name) {
    case 'train': return viewTrain(arg || '');
    case 'plans': return viewPlans();
    case 'plan': return viewPlan(arg);
    case 'session': return viewSession();
    case 'calendar': return viewCalendar();
    case 'library': return viewLibrary(params);
    case 'ex': return viewExercise(arg);
    case 'settings': return viewSettings();
    default: return viewHome();
  }
}
function stopRestIfLeaving() { if (!location.hash.startsWith('#/session')) stopRest(); }

async function boot() {
  try {
    await loadExercises();
  } catch {
    put($view(), h('p', { class: 'page center' }, 'تعذر تحميل مستودع التمارين. تحقق من الاتصال ثم أعد التحميل.'));
    return;
  }
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();

// للاختبار
export { MUSCLES_BY_SIDE };
