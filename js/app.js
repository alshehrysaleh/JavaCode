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
  const suggestions = forMuscles(muscles).slice(0, 8);

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
      h('section', {},
        h('div', { class: 'sec-row' },
          h('h2', { class: 'sec' }, 'تمارين مقترحة'),
          h('a', { href: '#/library?m=' + muscles[0], class: 'link' }, 'كل التمارين')),
        h('div', { class: 'list' }, suggestions.map((e) => exRow(e, { onclick: () => go('#/ex/' + e.id) }))))));
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

function exRow(e, { onclick, right } = {}) {
  return h('div', { class: 'ex-row', onclick },
    mediaEl(e, { small: true }),
    h('div', { class: 'ex-info' },
      h('div', { class: 'ex-name', dir: 'ltr' }, e.name),
      h('div', { class: 'tags' },
        e.primary.map((m) => h('span', { class: 'tag m' }, mAr(m))),
        h('span', { class: 'tag' }, eqAr(e.equipment)))),
    right || null);
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
            h('div', { class: 'ex-name', dir: 'ltr', onclick: () => showExercise(e) }, e.name),
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
  const filters = { q: '', muscle: d.muscles[0] || '', equipment: '' };
  const listEl = h('div', { class: 'list' });
  const count = h('b', {}, fmtNum(chosen.size));

  const renderList = () => {
    let items = filters.q || filters.equipment || !filters.muscle
      ? search(filters.q, filters)
      : forMuscles([filters.muscle]);
    const total = items.length;
    items = items.slice(0, 80);
    put(listEl, 
      h('p', { class: 'muted small' }, fmtNum(total), ' تمرين', total > 80 ? ' (اعرض أقل بالبحث أو الفلترة)' : ''),
      items.map((e) => {
        const box = h('button', { class: 'check' + (chosen.has(e.id) ? ' on' : ''), 'aria-label': 'اختيار' }, icon('check'));
        const row = exRow(e, { right: box, onclick: (ev) => {
          if (ev.target.closest('.ex-name')) { showExercise(e); return; }
          chosen.has(e.id) ? chosen.delete(e.id) : chosen.add(e.id);
          box.classList.toggle('on', chosen.has(e.id));
          count.textContent = fmtNum(chosen.size);
        } });
        return row;
      }));
  };

  const content = h('div', {},
    libraryFilters(filters, renderList, d.muscles),
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

function libraryFilters(filters, onChange, preferMuscles = []) {
  const muscleOrder = [...new Set([...preferMuscles, ...Object.keys(MUSCLE_AR)])];
  let t;
  return h('div', { class: 'filters' },
    h('label', { class: 'search' }, icon('search'),
      h('input', { type: 'search', placeholder: 'ابحث باسم التمرين (بالإنجليزية)', value: filters.q,
        oninput: (e) => { filters.q = e.target.value; clearTimeout(t); t = setTimeout(onChange, 200); } })),
    h('div', { class: 'chips scroll' },
      h('button', { class: 'chip' + (!filters.muscle ? ' on' : ''), onclick: pick('') }, 'الكل'),
      muscleOrder.map((m) => h('button', { class: 'chip' + (filters.muscle === m ? ' on' : ''), 'data-m': m, onclick: pick(m) }, mAr(m)))),
    h('select', { class: 'select', onchange: (e) => { filters.equipment = e.target.value; onChange(); } },
      h('option', { value: '' }, 'كل الأدوات'),
      Object.entries(EQUIPMENT_AR).map(([k, v]) => h('option', { value: k, selected: filters.equipment === k }, v))));

  function pick(m) {
    return (e) => {
      filters.muscle = m;
      e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.target));
      onChange();
    };
  }
}

/* ============ تبويب التمارين (المستودع) ============ */
const lib = { q: '', muscle: '', equipment: '' };

function viewLibrary(params) {
  if (params.get('m')) lib.muscle = params.get('m');
  const listEl = h('div', { class: 'list' });
  const renderList = () => {
    const items = lib.muscle && !lib.q && !lib.equipment ? forMuscles([lib.muscle]) : search(lib.q, lib);
    const shown = items.slice(0, 100);
    put(listEl, 
      h('p', { class: 'muted small' }, fmtNum(items.length), ' تمرين', items.length > 100 ? ' — يُعرض أول ١٠٠' : ''),
      shown.map((e) => exRow(e, { onclick: () => go('#/ex/' + e.id) })));
  };
  put($view(), 
    header('مستودع التمارين', { back: false }),
    h('main', { class: 'page' }, libraryFilters(lib, renderList), listEl));
  renderList();
}

function exerciseDetail(e) {
  return h('div', { class: 'ex-detail' },
    mediaEl(e),
    h('h2', { class: 'ex-title', dir: 'ltr' }, e.name),
    h('div', { class: 'tags' },
      e.primary.map((m) => h('span', { class: 'tag m' }, mAr(m))),
      e.secondary.map((m) => h('span', { class: 'tag m2' }, mAr(m))),
      h('span', { class: 'tag' }, eqAr(e.equipment)),
      e.level && h('span', { class: 'tag' }, LEVEL_AR[e.level] || e.level),
      e.category && h('span', { class: 'tag' }, CATEGORY_AR[e.category] || e.category)),
    h('h3', { class: 'sec' }, 'طريقة الأداء'),
    h('ol', { class: 'steps', dir: 'ltr' }, e.instructions.map((s) => h('li', {}, s))));
}

function showExercise(e) { openSheet(exerciseDetail(e), { title: 'تفاصيل التمرين' }); }

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
          h('div', {}, h('div', { class: 'ex-name', dir: 'ltr' }, fmtNum(ei + 1), '. ', e.name),
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

/* ============ تبويب التقويم ============ */
const cal = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: dateKey() };
const sessionDay = (s) => s.localDate || s.date.slice(0, 10);

function viewCalendar() {
  const first = new Date(cal.y, cal.m, 1);
  const days = new Date(cal.y, cal.m + 1, 0).getDate();
  // الأسبوع يبدأ بالسبت
  const offset = (first.getDay() + 1) % 7;
  const monthName = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { month: 'long', year: 'numeric' }).format(first);
  const byDay = {};
  db.state.sessions.forEach((s) => { (byDay[sessionDay(s)] ||= []).push(s); });
  const sched = {};
  db.state.schedule.forEach((s) => { (sched[s.date] ||= []).push(s); });
  const today = dateKey();
  const monthKey = `${cal.y}-${String(cal.m + 1).padStart(2, '0')}`;
  const monthSessions = db.state.sessions.filter((s) => sessionDay(s).startsWith(monthKey));

  const grid = h('div', { class: 'cal-grid' },
    ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].map((d) => h('div', { class: 'cal-dow' }, d)),
    Array.from({ length: offset }, () => h('div')),
    Array.from({ length: days }, (_, i) => {
      const k = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
      return h('button', {
        class: ['cal-day', k === today && 'today', k === cal.sel && 'sel', byDay[k] && 'has', sched[k] && 'plan'].filter(Boolean).join(' '),
        onclick: () => { cal.sel = k; viewCalendar(); },
      }, fmtNum(i + 1), h('i'));
    }));

  const selDate = new Date(cal.sel + 'T12:00:00');
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(selDate);
  const greg = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(selDate);
  const daySessions = byDay[cal.sel] || [];
  const dayPlans = (sched[cal.sel] || []).map((s) => db.plan(s.planId)).filter(Boolean);

  put($view(), 
    header('التقويم', { back: false }),
    h('main', { class: 'page' },
      h('div', { class: 'stats' },
        stat(fmtNum(monthSessions.length), 'تمارين هذا الشهر'),
        stat(fmtNum(Math.round(monthSessions.reduce((n, s) => n + s.durationSec, 0) / 60)), 'دقيقة'),
        stat(fmtNum(streak(byDay)), 'أيام متتالية')),
      h('div', { class: 'card' },
        h('div', { class: 'cal-head' },
          h('button', { class: 'icon-btn', 'aria-label': 'الشهر السابق', onclick: () => shift(-1) }, icon('back')),
          h('b', {}, monthName),
          h('button', { class: 'icon-btn flip-x', 'aria-label': 'الشهر التالي', onclick: () => shift(1) }, icon('back'))),
        grid,
        h('div', { class: 'legend' }, h('span', { class: 'dot has' }), 'تمرين منجز', h('span', { class: 'dot plan' }), 'تمرين مجدول')),
      h('h2', { class: 'sec' }, greg, h('small', { class: 'muted' }, ' · ', hijri)),
      dayPlans.map((p) => h('div', { class: 'card plan' },
        h('div', { class: 'plan-main' }, h('h3', {}, '📌 ', p.name), h('p', { class: 'muted' }, 'مجدول')),
        h('div', { class: 'plan-actions' },
          h('button', { class: 'icon-btn danger', 'aria-label': 'إزالة', onclick: () => { db.unschedule(cal.sel, p.id); viewCalendar(); } }, icon('x')),
          h('button', { class: 'btn primary sm', onclick: () => startSession(p.id) }, icon('play'), 'ابدأ')))),
      daySessions.map(sessionCard),
      !daySessions.length && !dayPlans.length ? h('p', { class: 'muted center' }, 'لا يوجد شيء في هذا اليوم') : null,
      db.state.plans.length ? h('button', { class: 'btn outline block', onclick: scheduleSheet }, icon('cal'), 'جدولة خطة في هذا اليوم') : null));

  function shift(d) {
    cal.m += d;
    if (cal.m < 0) { cal.m = 11; cal.y--; } else if (cal.m > 11) { cal.m = 0; cal.y++; }
    viewCalendar();
  }
  function scheduleSheet() {
    let close;
    close = openSheet(h('div', {}, db.state.plans.map((p) => h('button', { class: 'row-btn', onclick: () => {
      db.schedule(cal.sel, p.id); close(); viewCalendar();
    } }, p.name, h('span', { class: 'muted' }, p.muscles.map(mAr).join('، '))))), { title: 'اختر خطة' });
  }
}

function stat(v, l) { return h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)); }

function streak(byDay) {
  let n = 0;
  const d = new Date();
  if (!byDay[dateKey(d)]) d.setDate(d.getDate() - 1);
  while (byDay[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

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
        h('div', { class: 'ex-name', dir: 'ltr' }, e ? e.name : en.exId),
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
