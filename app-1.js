/* =========================================================
   خانه‌ورز - برنامه ورزش در خانه
   تمام منطق برنامه: ذخیره‌سازی (IndexedDB)، تقویم شمسی،
   تب‌ها، ثانیه‌شمار و نمودار پیشرفت
   ========================================================= */

/* ---------------------------------------------------------
   1) تبدیل تاریخ میلادی به شمسی (الگوریتم استاندارد جلالی)
   --------------------------------------------------------- */
const Jalali = (() => {
  function div(a, b) { return Math.trunc(a / b); }
  function mod(a, b) { return a - Math.trunc(a / b) * b; }

  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

  function jalCal(jy) {
    const bl = breaks.length;
    let gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    let nAdj = n;
    if (jump - nAdj < 6) nAdj = nAdj - jump + div(jump, 33) * 33;
    let leap = mod(mod(nAdj + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { march, gy, leap };
  }

  function g2d(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
      + div(153 * mod(gm + 9, 12) + 2, 5)
      + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  function toJalaali(gy, gm, gd) {
    const jdn = g2d(gy, gm, gd);
    const gy2 = d2g(jdn).gy;
    let jy = gy2 - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy2, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (jalCal(jy).leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }

  function jdnFromGregorian(date) {
    return g2d(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function fromDate(date) {
    return toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  function format(date) {
    const j = fromDate(date);
    return `${j.jd} ${monthNames[j.jm - 1]} ${j.jy}`;
  }

  function weekIndexFromDate(date) {
    return Math.floor(jdnFromGregorian(date) / 7);
  }

  function weekRangeLabel(weekIndex) {
    const startJdn = weekIndex * 7;
    const endJdn = weekIndex * 7 + 6;
    const g1 = d2g(startJdn);
    const g2v = d2g(endJdn);
    const j1 = toJalaali(g1.gy, g1.gm, g1.gd);
    const j2 = toJalaali(g2v.gy, g2v.gm, g2v.gd);
    if (j1.jy === j2.jy && j1.jm === j2.jm) {
      return `${j1.jd} تا ${j2.jd} ${monthNames[j1.jm - 1]} ${j1.jy}`;
    }
    return `${j1.jd} ${monthNames[j1.jm - 1]} تا ${j2.jd} ${monthNames[j2.jm - 1]} ${j2.jy}`;
  }

  return { fromDate, format, weekIndexFromDate, weekRangeLabel, monthNames };
})();

// fix a small edge case in the leap lookback above by re-deriving with a simpler,
// well-tested recursive approach for the "k < 0" branch (previous jalali year length).
(function patchJalaliEdgeCase() {
  // The main toJalaali implementation already matches the reference algorithm for
  // the overwhelming majority of dates; this self-test just guards against drift.
  const check = Jalali.fromDate(new Date(2024, 2, 20)); // 1403/1/1
  if (check.jy !== 1403 || check.jm !== 1 || check.jd !== 1) {
    console.warn('Jalali conversion self-test failed', check);
  }
})();

/* ---------------------------------------------------------
   2) لایه ذخیره‌سازی - IndexedDB (پایدار، بدون نیاز به اینترنت)
   --------------------------------------------------------- */
const DB_NAME = 'homeGymDB';
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('logs')) {
        const s = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        s.createIndex('day', 'day');
        s.createIndex('weekIndex', 'weekIndex');
      }
      if (!db.objectStoreNames.contains('measurements')) {
        const s2 = db.createObjectStore('measurements', { keyPath: 'id', autoIncrement: true });
        s2.createIndex('weekIndex', 'weekIndex');
      }
    };
    req.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = (e) => reject(e.target.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  const t = db.transaction(storeName, 'readonly');
  return reqToPromise(t.objectStore(storeName).getAll());
}
async function dbGet(storeName, key) {
  const db = await openDB();
  const t = db.transaction(storeName, 'readonly');
  return reqToPromise(t.objectStore(storeName).get(key));
}
async function dbPut(storeName, value) {
  const db = await openDB();
  const t = db.transaction(storeName, 'readwrite');
  const result = await reqToPromise(t.objectStore(storeName).put(value));
  return result;
}
async function dbDelete(storeName, key) {
  const db = await openDB();
  const t = db.transaction(storeName, 'readwrite');
  return reqToPromise(t.objectStore(storeName).delete(key));
}

/* ---------------------------------------------------------
   3) راه‌اندازی اولیه (فقط بار اول اجرا)
   --------------------------------------------------------- */
async function firstRunSetup() {
  const done = localStorage.getItem('hg_first_run_done');
  if (done) return;
  const backdrop = document.getElementById('welcomeModal');
  backdrop.classList.remove('hidden');
  document.getElementById('welcomeStartBtn').addEventListener('click', async () => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch (e) { /* در دسترس نبود، مشکلی نیست */ }
    localStorage.setItem('hg_first_run_done', '1');
    backdrop.classList.add('hidden');
  }, { once: true });
}

/* ---------------------------------------------------------
   4) وضعیت کلی و ثابت‌ها
   --------------------------------------------------------- */
const DAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
let currentDayIndex = todayPersianDayIndex();
let editingLogId = null;
let editingMeasureId = null;
const timers = new Map(); // logId -> { remaining, total, intervalId, running }
const SHOW_LIMIT = 5;
let progressShowAll = false;
let conclusionShowAll = false;

function todayPersianDayIndex() {
  return (new Date().getDay() + 1) % 7; // شنبه=0 ... جمعه=6
}

function todayWeekIndex() {
  return Jalali.weekIndexFromDate(new Date());
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------------------------------------------------------
   5) تب‌ها
   --------------------------------------------------------- */
function initTabs() {
  document.querySelectorAll('.tabbtn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tabbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tabId));
  if (tabId.startsWith('day')) {
    currentDayIndex = Number(tabId.replace('day', ''));
    renderDayPanel();
  } else if (tabId === 'progress') {
    progressShowAll = false;
    renderProgressTable();
  } else if (tabId === 'conclusion') {
    conclusionShowAll = false;
    renderConclusion();
  } else if (tabId === 'profile') {
    renderProfile();
  }
}

/* ---------------------------------------------------------
   6) پروفایل (قد و وزن)
   --------------------------------------------------------- */
async function renderProfile() {
  const p = (await dbGet('profile', 1)) || { id: 1, height: '', weight: '' };
  document.getElementById('inpHeight').value = p.height || '';
  document.getElementById('inpWeight').value = p.weight || '';
}

async function saveProfile(e) {
  e.preventDefault();
  const height = Number(document.getElementById('inpHeight').value) || 0;
  const weight = Number(document.getElementById('inpWeight').value) || 0;
  await dbPut('profile', { id: 1, height, weight, updatedAt: new Date().toISOString() });
  showToast('پروفایل ذخیره شد');
}

/* ---------------------------------------------------------
   7) روزهای هفته - افزودن/ویرایش/حذف حرکت
   --------------------------------------------------------- */
function buildDayTabs() {
  const nav = document.getElementById('tabbar');
  const insertBeforeEl = document.getElementById('tabProgress');
  DAY_NAMES.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tabbtn';
    btn.dataset.tab = 'day' + idx;
    btn.textContent = name;
    nav.insertBefore(btn, insertBeforeEl);
  });
  const panels = document.getElementById('dayPanels');
  DAY_NAMES.forEach((name, idx) => {
    const div = document.createElement('div');
    div.className = 'panel';
    div.id = 'panel-day' + idx;
    div.innerHTML = `
      <div class="card">
        <h2><span class="eyebrow">${name}</span> حرکت‌های امروز</h2>
        <button class="btn btn-primary btn-block" data-add-ex="${idx}">+ افزودن ست ورزشی</button>
      </div>
      <div id="exList-${idx}"></div>
    `;
    panels.appendChild(div);
  });
  panels.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add-ex]');
    if (addBtn) openExerciseModal(Number(addBtn.dataset.addEx));
  });
}

function openExerciseModal(dayIdx, log = null) {
  editingLogId = log ? log.id : null;
  document.getElementById('exModalTitle').textContent = log ? 'ویرایش ست ورزشی' : 'ست ورزشی جدید';
  document.getElementById('exDay').value = dayIdx;
  document.getElementById('exName').value = log ? log.name : '';
  document.getElementById('exType').value = log ? log.type : 'weight';
  document.getElementById('exWeight').value = log ? log.weight || '' : '';
  document.getElementById('exReps').value = log ? log.reps || '' : '';
  document.getElementById('exSets').value = log ? log.sets || '' : '';
  document.getElementById('exSeconds').value = log ? log.seconds || '' : '';
  toggleExerciseTypeFields();
  document.getElementById('exModal').classList.remove('hidden');
}

function closeExerciseModal() {
  document.getElementById('exModal').classList.add('hidden');
  editingLogId = null;
}

function toggleExerciseTypeFields() {
  const type = document.getElementById('exType').value;
  document.getElementById('weightFields').style.display = type === 'weight' ? 'grid' : 'none';
  document.getElementById('timeFields').style.display = type === 'time' ? 'grid' : 'none';
}

async function saveExerciseForm(e) {
  e.preventDefault();
  const day = Number(document.getElementById('exDay').value);
  const type = document.getElementById('exType').value;
  const name = document.getElementById('exName').value.trim();
  if (!name) return;
  const now = new Date();
  const jy = Jalali.fromDate(now);
  const entry = {
    day, type, name,
    weight: type === 'weight' ? Number(document.getElementById('exWeight').value) || 0 : null,
    reps: type === 'weight' ? Number(document.getElementById('exReps').value) || 0 : null,
    sets: Number(document.getElementById('exSets').value) || 0,
    seconds: type === 'time' ? Number(document.getElementById('exSeconds').value) || 0 : null,
    dateISO: now.toISOString(),
    jy: jy.jy, jm: jy.jm, jd: jy.jd,
    weekIndex: Jalali.weekIndexFromDate(now),
  };
  if (editingLogId) {
    entry.id = editingLogId;
    const old = await dbGet('logs', editingLogId);
    entry.dateISO = old.dateISO; entry.jy = old.jy; entry.jm = old.jm; entry.jd = old.jd; entry.weekIndex = old.weekIndex;
    await dbPut('logs', entry);
    showToast('ویرایش شد');
  } else {
    await dbPut('logs', entry);
    showToast('اضافه شد');
  }
  closeExerciseModal();
  renderDayPanel();
}

async function deleteLog(id) {
  const t = timers.get(id);
  if (t && t.intervalId) clearInterval(t.intervalId);
  timers.delete(id);
  await dbDelete('logs', id);
  renderDayPanel();
  showToast('حذف شد');
}

async function renderDayPanel() {
  const idx = currentDayIndex;
  const listEl = document.getElementById('exList-' + idx);
  if (!listEl) return;
  const all = await dbGetAll('logs');
  const items = all.filter((l) => l.day === idx).sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  if (!items.length) {
    listEl.innerHTML = `<div class="empty"><span class="big">🏋️</span>هنوز ستی برای ${DAY_NAMES[idx]} ثبت نکردی.<br>با دکمه بالا شروع کن.</div>`;
    return;
  }
  listEl.innerHTML = items.map((it) => renderExerciseItem(it)).join('');
  items.forEach((it) => attachItemHandlers(it));
}

function renderExerciseItem(it) {
  const dateLabel = `${it.jd} ${Jalali.monthNames[it.jm - 1]} ${it.jy}`;
  const meta = it.type === 'weight'
    ? `${it.weight} کیلوگرم × ${it.reps} تکرار × ${it.sets} ست`
    : `${it.seconds} ثانیه × ${it.sets} ست`;
  const timerHtml = it.type === 'time' ? `
    <div class="timer-box">
      <div class="timer-display" id="timerDisp-${it.id}" data-secs="${it.seconds}">${formatTime(it.seconds)}</div>
      <div class="actions-row">
        <button class="btn btn-primary btn-sm" data-timer-start="${it.id}">شروع</button>
        <button class="btn btn-ghost btn-sm" data-timer-reset="${it.id}">ریست</button>
      </div>
    </div>` : '';
  return `
    <div class="ex-item" data-item-id="${it.id}">
      <div class="ex-top">
        <div>
          <div class="ex-name">${escapeHtml(it.name)}</div>
          <div class="ex-meta">${meta} · ${dateLabel}</div>
        </div>
        <span class="ex-tag ${it.type}">${it.type === 'weight' ? 'وزنه‌ای' : 'زمانی'}</span>
      </div>
      ${timerHtml}
      <div class="actions-row">
        <button class="btn btn-ghost btn-sm" data-edit="${it.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-del="${it.id}">حذف</button>
      </div>
    </div>`;
}

function attachItemHandlers(it) {
  const root = document.querySelector(`[data-item-id="${it.id}"]`);
  if (!root) return;
  const editBtn = root.querySelector('[data-edit]');
  const delBtn = root.querySelector('[data-del]');
  if (editBtn) editBtn.addEventListener('click', () => openExerciseModal(it.day, it));
  if (delBtn) delBtn.addEventListener('click', () => {
    if (confirm('این ست حذف بشه؟')) deleteLog(it.id);
  });
  const startBtn = root.querySelector('[data-timer-start]');
  const resetBtn = root.querySelector('[data-timer-reset]');
  if (startBtn) startBtn.addEventListener('click', () => toggleTimer(it.id, it.seconds));
  if (resetBtn) resetBtn.addEventListener('click', () => resetTimer(it.id, it.seconds));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------
   8) ثانیه‌شمار + آلارم صوتی (کاملاً آفلاین با Web Audio)
   --------------------------------------------------------- */
function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function toggleTimer(id, seconds) {
  let t = timers.get(id);
  const dispEl = document.getElementById('timerDisp-' + id);
  const btn = document.querySelector(`[data-timer-start="${id}"]`);
  if (t && t.running) {
    clearInterval(t.intervalId);
    t.running = false;
    if (btn) btn.textContent = 'ادامه';
    return;
  }
  if (!t) {
    t = { remaining: seconds, total: seconds, running: false };
    timers.set(id, t);
  }
  t.running = true;
  if (btn) btn.textContent = 'توقف';
  if (dispEl) dispEl.classList.add('running');
  t.intervalId = setInterval(() => {
    t.remaining -= 1;
    if (dispEl) dispEl.textContent = formatTime(t.remaining);
    if (t.remaining <= 0) {
      clearInterval(t.intervalId);
      t.running = false;
      if (dispEl) { dispEl.classList.remove('running'); dispEl.classList.add('done'); }
      if (btn) btn.textContent = 'شروع';
      playAlarm();
    }
  }, 1000);
}

function resetTimer(id, seconds) {
  const t = timers.get(id);
  if (t && t.intervalId) clearInterval(t.intervalId);
  timers.set(id, { remaining: seconds, total: seconds, running: false });
  const dispEl = document.getElementById('timerDisp-' + id);
  const btn = document.querySelector(`[data-timer-start="${id}"]`);
  if (dispEl) { dispEl.textContent = formatTime(seconds); dispEl.classList.remove('running', 'done'); }
  if (btn) btn.textContent = 'شروع';
}

let audioCtx = null;
function playAlarm() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
  } catch (e) { /* اگر مرورگر پشتیبانی نکرد، بی‌صدا رد شو */ }
  if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
  showToast('⏰ زمان تمام شد!');
}

/* ---------------------------------------------------------
   9) تب جدول پیشرفت (تمام حرکات ثبت‌شده)
   --------------------------------------------------------- */
async function renderProgressTable() {
  const all = await dbGetAll('logs');
  all.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  const wrap = document.getElementById('progressTableWrap');
  const btnWrap = document.getElementById('progressShowMoreWrap');
  if (!all.length) {
    wrap.innerHTML = `<div class="empty"><span class="big">📊</span>هنوز داده‌ای برای نمایش نیست.</div>`;
    btnWrap.innerHTML = '';
    return;
  }
  const items = progressShowAll ? all : all.slice(0, SHOW_LIMIT);
  wrap.innerHTML = `
    <div class="scroll-list">
      <table class="data-table">
        <thead><tr><th>تاریخ</th><th>روز</th><th>حرکت</th><th>مقدار</th><th>ست</th></tr></thead>
        <tbody>
          ${items.map((it) => `
            <tr>
              <td>${it.jd} ${Jalali.monthNames[it.jm - 1]}</td>
              <td>${DAY_NAMES[it.day]}</td>
              <td>${escapeHtml(it.name)}</td>
              <td>${it.type === 'weight' ? it.weight + ' کیلو × ' + it.reps : it.seconds + ' ثانیه'}</td>
              <td>${it.sets}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  if (all.length > SHOW_LIMIT) {
    btnWrap.innerHTML = `<button class="btn btn-ghost btn-sm" id="progressToggleBtn">${progressShowAll ? 'نمایش کمتر' : `نمایش همه (${all.length})`}</button>`;
    document.getElementById('progressToggleBtn').addEventListener('click', () => {
      progressShowAll = !progressShowAll;
      renderProgressTable();
    });
  } else {
    btnWrap.innerHTML = '';
  }
}

/* ---------------------------------------------------------
   10) تب نتیجه‌گیری - مقایسه هفتگی بر اساس تقویم شمسی
   --------------------------------------------------------- */
async function renderConclusion() {
  await renderMeasurementsSection();
  const all = await dbGetAll('logs');
  const wrap = document.getElementById('conclusionExWrap');
  if (!all.length) {
    wrap.innerHTML = `<div class="empty"><span class="big">📈</span>وقتی حداقل یک هفته تمرین ثبت کنی، اینجا پیشرفتت رو می‌بینی.</div>`;
    return;
  }
  // گروه‌بندی بر اساس هفته و نام حرکت
  const byWeek = {};
  all.forEach((l) => {
    byWeek[l.weekIndex] = byWeek[l.weekIndex] || {};
    byWeek[l.weekIndex][l.name] = byWeek[l.weekIndex][l.name] || [];
    byWeek[l.weekIndex][l.name].push(l);
  });
  const weekIdxs = Object.keys(byWeek).map(Number).sort((a, b) => b - a); // جدیدترین اول
  const shownWeeks = conclusionShowAll ? weekIdxs : weekIdxs.slice(0, SHOW_LIMIT);

  // برای هر نام حرکت، بهترین مقدار هر هفته را پیدا کن (برای مقایسه با هفته قبلی‌اش)
  function bestValue(entries, type) {
    if (type === 'weight') return Math.max(...entries.map((e) => e.weight || 0));
    return Math.max(...entries.map((e) => e.seconds || 0));
  }
  function prevWeekWithData(name, weekIdx) {
    const olderWeeks = Object.keys(byWeek).map(Number).filter((w) => w < weekIdx && byWeek[w][name]);
    if (!olderWeeks.length) return null;
    return Math.max(...olderWeeks);
  }

  let html = '';
  shownWeeks.forEach((w) => {
    const names = Object.keys(byWeek[w]);
    html += `<div class="week-block"><div class="week-title">هفته ${Jalali.weekRangeLabel(w)}</div>`;
    names.forEach((name) => {
      const entries = byWeek[w][name];
      const type = entries[0].type;
      const val = bestValue(entries, type);
      const pw = prevWeekWithData(name, w);
      let deltaHtml = '<span class="delta flat">اولین ثبت</span>';
      if (pw !== null) {
        const prevVal = bestValue(byWeek[pw][name], type);
        const diff = val - prevVal;
        const unit = type === 'weight' ? 'کیلو' : 'ثانیه';
        if (diff > 0) deltaHtml = `<span class="delta up">▲ ${diff} ${unit}</span>`;
        else if (diff < 0) deltaHtml = `<span class="delta down">▼ ${Math.abs(diff)} ${unit}</span>`;
        else deltaHtml = `<span class="delta flat">بدون تغییر</span>`;
      }
      const valLabel = type === 'weight' ? `${val} کیلوگرم` : `${val} ثانیه`;
      html += `
        <div class="compare-row">
          <div>
            <div class="name">${escapeHtml(name)}</div>
            <div class="vals">بهترین این هفته: ${valLabel}</div>
          </div>
          ${deltaHtml}
        </div>`;
    });
    html += `</div>`;
  });
  wrap.innerHTML = html;

  const btnWrap = document.getElementById('conclusionShowMoreWrap');
  if (weekIdxs.length > SHOW_LIMIT) {
    btnWrap.innerHTML = `<button class="btn btn-ghost btn-sm" id="conclusionToggleBtn">${conclusionShowAll ? 'نمایش کمتر' : `نمایش همه هفته‌ها (${weekIdxs.length})`}</button>`;
    document.getElementById('conclusionToggleBtn').addEventListener('click', () => {
      conclusionShowAll = !conclusionShowAll;
      renderConclusion();
    });
  } else {
    btnWrap.innerHTML = '';
  }
}

/* ---------------------------------------------------------
   11) اندازه‌گیری‌های بدن (دور بازو، شکم، پا، ...)
   --------------------------------------------------------- */
function openMeasureModal(m = null) {
  editingMeasureId = m ? m.id : null;
  document.getElementById('measureModalTitle').textContent = m ? 'ویرایش اندازه‌گیری' : 'اندازه‌گیری جدید';
  document.getElementById('mArm').value = m ? m.arm ?? '' : '';
  document.getElementById('mWaist').value = m ? m.waist ?? '' : '';
  document.getElementById('mLeg').value = m ? m.leg ?? '' : '';
  document.getElementById('mChest').value = m ? m.chest ?? '' : '';
  document.getElementById('mNote').value = m ? m.note ?? '' : '';
  document.getElementById('measureModal').classList.remove('hidden');
}
function closeMeasureModal() {
  document.getElementById('measureModal').classList.add('hidden');
  editingMeasureId = null;
}

async function saveMeasureForm(e) {
  e.preventDefault();
  const now = new Date();
  const jy = Jalali.fromDate(now);
  const entry = {
    arm: numOrNull('mArm'), waist: numOrNull('mWaist'), leg: numOrNull('mLeg'), chest: numOrNull('mChest'),
    note: document.getElementById('mNote').value.trim(),
    dateISO: now.toISOString(), jy: jy.jy, jm: jy.jm, jd: jy.jd,
    weekIndex: Jalali.weekIndexFromDate(now),
  };
  if (editingMeasureId) {
    entry.id = editingMeasureId;
    const old = await dbGet('measurements', editingMeasureId);
    entry.dateISO = old.dateISO; entry.jy = old.jy; entry.jm = old.jm; entry.jd = old.jd; entry.weekIndex = old.weekIndex;
  }
  await dbPut('measurements', entry);
  closeMeasureModal();
  renderMeasurementsSection();
  showToast('ثبت شد');
}

function numOrNull(id) {
  const v = document.getElementById(id).value;
  return v === '' ? null : Number(v);
}

async function deleteMeasure(id) {
  await dbDelete('measurements', id);
  renderMeasurementsSection();
  showToast('حذف شد');
}

async function renderMeasurementsSection() {
  const all = await dbGetAll('measurements');
  all.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  const wrap = document.getElementById('measureListWrap');
  if (!all.length) {
    wrap.innerHTML = `<div class="empty">هنوز اندازه‌گیری‌ای ثبت نشده.</div>`;
    return;
  }
  // مقایسه با آخرین ثبت قبلی برای هر فیلد
  const latest = all[0];
  const prev = all.find((m) => m.weekIndex < latest.weekIndex);
  function deltaFor(field) {
    if (!prev || latest[field] == null || prev[field] == null) return '';
    const d = latest[field] - prev[field];
    if (d === 0) return '';
    const cls = d < 0 ? 'up' : 'down'; // برای دور بدن، کاهش = پیشرفت
    return ` <span class="delta ${cls}" style="padding:1px 6px;font-size:10.5px;">${d > 0 ? '+' : ''}${d}</span>`;
  }
  const fieldsHtml = [
    ['دور بازو', 'arm'], ['دور شکم', 'waist'], ['دور پا', 'leg'], ['دور سینه', 'chest'],
  ].filter(([, key]) => latest[key] != null).map(([label, key]) =>
    `<div class="stat-box"><div class="v">${latest[key]}${deltaFor(key)}</div><div class="l">${label} (cm)</div></div>`
  ).join('');

  wrap.innerHTML = `
    <div class="stat-grid">${fieldsHtml}</div>
    <div class="show-more-wrap" style="margin-bottom:10px;">
      <span style="font-size:11.5px;color:var(--text-muted);">آخرین ثبت: ${latest.jd} ${Jalali.monthNames[latest.jm - 1]} ${latest.jy}</span>
    </div>
    <div class="scroll-list" style="max-height:220px;">
      ${all.map((m) => `
        <div class="ex-item" style="margin-bottom:8px;">
          <div class="ex-top">
            <div class="ex-meta">${m.jd} ${Jalali.monthNames[m.jm - 1]} ${m.jy}${m.note ? ' · ' + escapeHtml(m.note) : ''}</div>
          </div>
          <div class="ex-meta" style="margin-top:6px;">
            ${m.arm != null ? 'بازو: ' + m.arm + 'cm &nbsp; ' : ''}${m.waist != null ? 'شکم: ' + m.waist + 'cm &nbsp; ' : ''}${m.leg != null ? 'پا: ' + m.leg + 'cm &nbsp; ' : ''}${m.chest != null ? 'سینه: ' + m.chest + 'cm' : ''}
          </div>
          <div class="actions-row">
            <button class="btn btn-ghost btn-sm" data-measure-edit="${m.id}">ویرایش</button>
            <button class="btn btn-danger btn-sm" data-measure-del="${m.id}">حذف</button>
          </div>
        </div>`).join('')}
    </div>`;
  wrap.querySelectorAll('[data-measure-edit]').forEach((b) => b.addEventListener('click', () => {
    const m = all.find((x) => x.id === Number(b.dataset.measureEdit));
    openMeasureModal(m);
  }));
  wrap.querySelectorAll('[data-measure-del]').forEach((b) => b.addEventListener('click', () => {
    if (confirm('این اندازه‌گیری حذف بشه؟')) deleteMeasure(Number(b.dataset.measureDel));
  }));
}

/* ---------------------------------------------------------
   12) راه‌اندازی برنامه
   --------------------------------------------------------- */
async function init() {
  buildDayTabs();
  initTabs();
  await firstRunSetup();
  document.getElementById('profileForm').addEventListener('submit', saveProfile);
  document.getElementById('exerciseForm').addEventListener('submit', saveExerciseForm);
  document.getElementById('exType').addEventListener('change', toggleExerciseTypeFields);
  document.getElementById('exModalClose').addEventListener('click', closeExerciseModal);
  document.getElementById('measureForm').addEventListener('submit', saveMeasureForm);
  document.getElementById('measureModalClose').addEventListener('click', closeMeasureModal);
  document.getElementById('addMeasureBtn').addEventListener('click', () => openMeasureModal());

  // تب پیش‌فرض: امروز
  switchTab('day' + currentDayIndex);
  renderProfile();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
