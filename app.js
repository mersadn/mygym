/* =========================================================
   خانه‌ورز - برنامه ورزش در خانه (ویرایش شده)
   تمام منطق برنامه: ذخیره‌سازی، تقویم شمسی، سوایپ، ست/استراحت/آلارم
   ========================================================= */

/* ---------------------------------------------------------
   1) تبدیل تاریخ میلادی به شمسی (الگوریتم جلالی)
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

(function patchJalaliEdgeCase() {
  const check = Jalali.fromDate(new Date(2024, 2, 20)); // 1403/1/1
  if (check.jy !== 1403 || check.jm !== 1 || check.jd !== 1) {
    console.warn('Jalali conversion self-test failed', check);
  }
})();

/* ---------------------------------------------------------
   2) IndexedDB - ذخیره‌سازی پایدار
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
   3) راه‌اندازی اولیه
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
    } catch (e) { }
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
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let isSwipingDays = false;

// لیست تب‌های کلی (برای swipe بین همه تب‌ها)
// ترتیب دقیقاً باید با ترتیب نمایش تب‌ها در نوار تب یکی باشد:
// پروفایل، شنبه تا جمعه، جدول، نتیجه‌گیری
const TAB_ORDER = [
  'profile',
  'day0', 'day1', 'day2', 'day3', 'day4', 'day5', 'day6',
  'progress', 'conclusion'
];
let currentTabIndex = 0; // شاخص تب فعال در TAB_ORDER

const exerciseState = new Map(); // id -> { currentSet: 1, timerRunning: false, remaining: 0, intervalId: null }
const SHOW_LIMIT = 5;
let progressShowAll = false;
let conclusionShowAll = false;
const SETS_PER_EXERCISE = 3;
const REST_SECONDS = 30;

function todayPersianDayIndex() {
  return (new Date().getDay() + 1) % 7;
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
   5) سوایپ بین روزها
   --------------------------------------------------------- */
function initSwipe() {
  document.addEventListener('touchstart', (e) => {
    // فقط با یک انگشت (نه پینچ/زوم)
    if (e.touches.length !== 1) { isSwipingDays = false; return; }
    // فقط روی روزها (نه روی modals، دکمه‌ها، فرم‌ها یا نوار تب که خودش اسکرول افقی دارد)
    if (e.target.closest('.modal-backdrop, button, input, select, textarea, nav.tabbar')) {
      isSwipingDays = false;
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    // مقداردهی اولیه‌ی نقطه‌ی پایان با نقطه‌ی شروع تا در صورت یک "تپ" ساده
    // (بدون هیچ حرکتی که باعث fire شدن touchmove بشه) مقادیر قبلی باقی‌مانده
    // از سوایپ‌های پیشین باعث تشخیص اشتباه سوایپ نشوند.
    touchEndX = touchStartX;
    touchEndY = touchStartY;
    isSwipingDays = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isSwipingDays) return;
    touchEndX = e.touches[0].clientX;
    touchEndY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!isSwipingDays) return;
    isSwipingDays = false;
    handleSwipe();
    // ریست کردن مقادیر تا در تپ‌های بعدی اثر نگذارند
    touchStartX = touchStartY = touchEndX = touchEndY = 0;
  }, false);

  document.addEventListener('touchcancel', () => {
    isSwipingDays = false;
  }, false);
}

function handleSwipe() {
  const threshold = 40;
  const diffX = touchStartX - touchEndX;
  const diffY = Math.abs(touchStartY - touchEndY);

  // اگر حرکت عمودی بیش‌تر از افقی باشد، swipe محسوب نمی‌شود
  if (diffY > Math.abs(diffX)) return;

  // باید مینیمم 40px کشش باشد
  if (Math.abs(diffX) < threshold) return;

  // RTL است، پس منطق معکوس است
  // تب‌ها به صورت چرخشی (حلقه‌ای) هستند: بعد از آخرین تب به اولین تب
  // برمی‌گردد و برعکس (از اولین تب به آخرین تب).
  if (diffX < 0) {
    // حرکت به راست (در RTL = تب بعدی)
    const nextIndex = (currentTabIndex + 1) % TAB_ORDER.length;
    switchTab(TAB_ORDER[nextIndex], 'next');
  } else {
    // حرکت به چپ (در RTL = تب قبلی)
    const prevIndex = (currentTabIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    switchTab(TAB_ORDER[prevIndex], 'prev');
  }
}

/* ---------------------------------------------------------
   6) تب‌ها و سوایچ
   --------------------------------------------------------- */
function initTabs() {
  document.querySelectorAll('.tabbtn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId, forcedDirection) {
  const newIndex = TAB_ORDER.indexOf(tabId);
  if (newIndex === -1) return;
  if (newIndex === currentTabIndex && document.getElementById('panel-' + tabId).classList.contains('active')) {
    return; // از قبل همین تب فعاله، کاری لازم نیست
  }

  const oldIndex = currentTabIndex;
  // forcedDirection برای حالت چرخشی (سوایپ از آخرین تب به اولین تب یا برعکس)
  // استفاده می‌شود چون در آن حالت مقایسه‌ی ساده‌ی index جهت اشتباه می‌دهد.
  const direction = forcedDirection || (newIndex > oldIndex ? 'next' : (newIndex < oldIndex ? 'prev' : null));
  currentTabIndex = newIndex;

  // اگر روی تب روزها باشیم currentDayIndex رو آپ‌دیت کن
  if (tabId.startsWith('day')) {
    currentDayIndex = Number(tabId.replace('day', ''));
  }

  document.querySelectorAll('.tabbtn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));

  // دکمه‌ی شناور «افزودن حرکت» فقط باید توی تب روزهای هفته دیده بشه
  const fab = document.getElementById('fabAddEx');
  if (fab) fab.style.display = tabId.startsWith('day') ? 'flex' : 'none';

  // محتوای پنل جدید را قبل از نمایش/انیمیشن آپدیت می‌کنیم تا هنگام
  // اسلاید شدن، ری‌رندر شدن محتوا باعث پرش/فلش زشت روی صفحه نشه
  if (tabId.startsWith('day')) {
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

  const oldPanel = document.querySelector('.panel.active');
  const newPanel = document.getElementById('panel-' + tabId);

  // اسکرول صفحه رو قبل از نمایش پنل جدید به بالا برمی‌گردونیم، چون
  // اختلاف ارتفاع بین پنل‌ها (مثلاً روز خالی در مقابل جدول بلند) باعث
  // پرش ناگهانی و حس «رفرش» می‌شد
  window.scrollTo({ top: 0, behavior: 'auto' });

  if (direction && oldPanel && newPanel && oldPanel !== newPanel) {
    animatePanelSwitch(oldPanel, newPanel, direction);
  } else {
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tabId));
    // برای حالت‌های بدون جهت مشخص (مثلاً بار اول لود شدن اپ) یک فید ساده
    // نمایش می‌دیم؛ کلاس رو بعد از تموم شدن انیمیشن حذف می‌کنیم تا
    // animation-name ثابت (fadein) باقی نمونه و دوباره ری‌استارت نشه.
    if (newPanel) {
      newPanel.classList.remove('fade-in');
      void newPanel.offsetWidth; // ریست اجباری برای ری‌استارت درست انیمیشن
      newPanel.classList.add('fade-in');
      newPanel.addEventListener('animationend', () => newPanel.classList.remove('fade-in'), { once: true });
    }
  }
}

// انیمیشن اسلاید بین دو تب (چه با تپ روی نوار تب، چه با سوایپ)
// توجه: پنل‌های تب‌ها (روزها / پروفایل / جدول / نتیجه‌گیری) در DOM هم‌والد نیستند
// و position مطلق هم ندارند، پس نمی‌توان هم‌زمان هر دو را «active» نگه داشت
// (باعث جابه‌جایی/جهش چیدمان می‌شود). به همین دلیل پنل قدیمی فوراً مخفی می‌شود
// و فقط پنل جدید با اسلاید وارد می‌شود.
function animatePanelSwitch(oldPanel, newPanel, direction) {
  // پاک‌سازی کلاس‌های باقی‌مانده از انیمیشن‌های قبلی که کامل نشده‌اند
  // (fade-in هم پاک می‌شود چون اگر روی پنل جدید باقی بماند، دوباره با
  // animation-name فرق‌کرده باعث اجرای اضافه‌ی fadein بعد از اسلاید می‌شود)
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.remove('slide-left', 'slide-right', 'slide-enter-from-right', 'slide-enter-from-left', 'fade-in');
  });

  oldPanel.classList.remove('active');

  const inClass = direction === 'next' ? 'slide-enter-from-right' : 'slide-enter-from-left';
  newPanel.classList.add('active', inClass);

  const finishIn = () => {
    newPanel.classList.remove(inClass);
    newPanel.removeEventListener('animationend', finishIn);
  };
  newPanel.addEventListener('animationend', finishIn, { once: true });
}

/* ---------------------------------------------------------
   7) پروفایل
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
   8) ساخت تب‌های روزها و افزودن حرکت
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
      <div class="day-header">
        <div class="day-name">${name}</div>
        <div class="day-desc">حرکت‌های برنامه‌ی امروز را اضافه کن</div>
      </div>
      <div id="exList-${idx}"></div>
    `;
    panels.appendChild(div);
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
  document.getElementById('exSets').value = log ? log.sets || SETS_PER_EXERCISE : '';
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
    sets: Number(document.getElementById('exSets').value) || SETS_PER_EXERCISE,
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
  const state = exerciseState.get(id);
  if (state && state.intervalId) clearInterval(state.intervalId);
  exerciseState.delete(id);
  await dbDelete('logs', id);
  renderDayPanel();
  showToast('حذف شد');
}

/* ---------------------------------------------------------
   9) نمایش لیست حرکت‌های روز با سیستم ست و استراحت
   --------------------------------------------------------- */
async function renderDayPanel() {
  const idx = currentDayIndex;
  const listEl = document.getElementById('exList-' + idx);
  if (!listEl) return;
  const all = await dbGetAll('logs');
  const items = all.filter((l) => l.day === idx).sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  if (!items.length) {
    listEl.innerHTML = `<div class="empty"><span class="big">🏋️</span>هنوز ستی برای ${DAY_NAMES[idx]} ثبت نکردی.</div>`;
    return;
  }
  listEl.innerHTML = items.map((it) => renderExerciseItem(it)).join('');
  items.forEach((it) => attachItemHandlers(it));
}

function renderExerciseItem(it) {
  const dateLabel = `${it.jd} ${Jalali.monthNames[it.jm - 1]} ${it.jy}`;
  const state = exerciseState.get(it.id) || { currentSet: 1, timerRunning: false, remaining: 0 };
  
  let contentHtml = '';
  if (it.type === 'weight') {
    contentHtml = `<div class="ex-meta">${it.weight} کیلوگرم × ${it.reps} تکرار</div>`;
  }
  
  // نمایش ست‌ها
  let setCounterHtml = '<div class="set-counter">';
  for (let i = 1; i <= (it.sets || SETS_PER_EXERCISE); i++) {
    const isActive = state.currentSet === i ? 'active' : '';
    setCounterHtml += `<div class="set-dot ${isActive}" title="ست ${i}"></div>`;
  }
  setCounterHtml += '</div>';
  
  // تایمر و دکمه‌های کنترل
  let timerHtml = '';
  if (it.type === 'time' || true) { // هر دو نوع نیاز به ست دارند
    const displayText = state.timerRunning 
      ? `استراحت: ${state.remaining}ثانیه` 
      : (state.currentSet > (it.sets || SETS_PER_EXERCISE) ? 'تمام شد ✓' : `ست ${state.currentSet}`);
    
    timerHtml = `
      <div class="timer-info">
        <div class="time-left">${displayText}</div>
      </div>
      <div class="actions-row">
        <button class="btn btn-primary btn-sm" data-set-start="${it.id}">
          ${state.timerRunning ? 'توقف' : 'شروع استراحت'}
        </button>
        <button class="btn btn-ghost btn-sm" data-set-next="${it.id}">ست بعدی</button>
        <button class="btn btn-ghost btn-sm" data-set-reset="${it.id}">ریست</button>
      </div>
    `;
  }
  
  return `
    <div class="ex-item" data-item-id="${it.id}">
      <div class="ex-top">
        <div>
          <div class="ex-name">${escapeHtml(it.name)}</div>
          <div class="ex-meta">${it.sets || SETS_PER_EXERCISE} ست ${it.type === 'weight' ? '× ' + it.weight + 'کیلو × ' + it.reps : '× ' + it.seconds + 'ثانیه'} · ${dateLabel}</div>
        </div>
        <span class="ex-tag ${it.type}">${it.type === 'weight' ? 'وزنه‌ای' : 'زمانی'}</span>
      </div>
      ${setCounterHtml}
      ${timerHtml}
      <div class="actions-row" style="margin-top:8px;">
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
  const startBtn = root.querySelector('[data-set-start]');
  const nextBtn = root.querySelector('[data-set-next]');
  const resetBtn = root.querySelector('[data-set-reset]');
  
  if (editBtn) editBtn.addEventListener('click', () => openExerciseModal(it.day, it));
  if (delBtn) delBtn.addEventListener('click', () => {
    if (confirm('این ست حذف بشه؟')) deleteLog(it.id);
  });
  if (startBtn) startBtn.addEventListener('click', () => toggleSetTimer(it.id));
  if (nextBtn) nextBtn.addEventListener('click', () => nextSet(it.id, it.sets || SETS_PER_EXERCISE));
  if (resetBtn) resetBtn.addEventListener('click', () => resetSets(it.id));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------------------------------------------------
   10) سیستم ست و استراحت و آلارم
   --------------------------------------------------------- */

// آپدیت سبک فقط بخش‌های تغییرکرده‌ی یک آیتم (بدون بازسازی کل لیست)
// تا در حین شمارش معکوس هر ثانیه، کل صفحه رفرش/فلش نزنه
function updateItemTimerUI(id) {
  const root = document.querySelector(`[data-item-id="${id}"]`);
  if (!root) return;
  const state = exerciseState.get(id);
  if (!state) return;
  const totalSets = root.querySelectorAll('.set-dot').length || SETS_PER_EXERCISE;

  const timeLeftEl = root.querySelector('.time-left');
  if (timeLeftEl) {
    timeLeftEl.textContent = state.timerRunning
      ? `استراحت: ${state.remaining}ثانیه`
      : (state.currentSet > totalSets ? 'تمام شد ✓' : `ست ${state.currentSet}`);
  }

  const startBtn = root.querySelector('[data-set-start]');
  if (startBtn) startBtn.textContent = state.timerRunning ? 'توقف' : 'شروع استراحت';

  root.querySelectorAll('.set-dot').forEach((dot, i) => {
    dot.classList.toggle('active', state.currentSet === i + 1);
  });
}

function toggleSetTimer(id) {
  let state = exerciseState.get(id);
  if (!state) {
    state = { currentSet: 1, timerRunning: false, remaining: REST_SECONDS };
    exerciseState.set(id, state);
  }
  
  if (state.timerRunning) {
    clearInterval(state.intervalId);
    state.timerRunning = false;
    updateItemTimerUI(id);
    return;
  }
  
  state.timerRunning = true;
  state.remaining = REST_SECONDS;
  
  state.intervalId = setInterval(() => {
    state.remaining--;
    updateItemTimerUI(id);
    
    if (state.remaining <= 0) {
      clearInterval(state.intervalId);
      state.timerRunning = false;
      state.currentSet++;
      playAlarm();
      updateItemTimerUI(id);
      showToast(`ست ${state.currentSet} شروع شو`);
    }
  }, 1000);
  
  updateItemTimerUI(id);
}

function nextSet(id, totalSets) {
  let state = exerciseState.get(id);
  if (!state) {
    state = { currentSet: 1, timerRunning: false, remaining: 0 };
    exerciseState.set(id, state);
  }
  
  if (state.intervalId) clearInterval(state.intervalId);
  state.timerRunning = false;
  
  if (state.currentSet < totalSets) {
    state.currentSet++;
  }
  updateItemTimerUI(id);
}

function resetSets(id) {
  const state = exerciseState.get(id);
  if (state && state.intervalId) clearInterval(state.intervalId);
  exerciseState.set(id, { currentSet: 1, timerRunning: false, remaining: 0 });
  updateItemTimerUI(id);
  showToast('ریست شد');
}

/* ---------------------------------------------------------
   11) آلارم صوتی
   --------------------------------------------------------- */
let audioCtx = null;
function playAlarm() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.setValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) { console.log('آلارم صوتی دسترس‌پذیر نبود'); }
}

/* ---------------------------------------------------------
   12) جدول پیشرفت
   --------------------------------------------------------- */
async function renderProgressTable() {
  const all = await dbGetAll('logs');
  const wrap = document.getElementById('progressTableWrap');
  if (!all.length) {
    wrap.innerHTML = `<div class="empty"><span class="big">📊</span>هنوز ستی ثبت نشده.</div>`;
    return;
  }
  all.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  const shown = progressShowAll ? all : all.slice(0, SHOW_LIMIT);
  let html = `<table class="data-table"><thead><tr><th>حرکت</th><th>نوع</th><th>مقدار</th><th>روز</th></tr></thead><tbody>`;
  shown.forEach((l) => {
    const val = l.type === 'weight' ? `${l.weight}kg×${l.reps}` : `${l.seconds}s`;
    html += `<tr><td>${escapeHtml(l.name)}</td><td>${l.type === 'weight' ? 'وزنه' : 'زمان'}</td><td>${val}</td><td>${DAY_NAMES[l.day]}</td></tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
  
  const btnWrap = document.getElementById('progressShowMoreWrap');
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
   13) نتیجه‌گیری و مقایسه
   --------------------------------------------------------- */
async function renderConclusion() {
  await renderMeasurementsSection();
  const all = await dbGetAll('logs');
  const wrap = document.getElementById('conclusionExWrap');
  if (!all.length) {
    wrap.innerHTML = `<div class="empty"><span class="big">📈</span>وقتی حداقل یک هفته تمرین ثبت کنی، اینجا پیشرفتت رو می‌بینی.</div>`;
    return;
  }
  const byWeek = {};
  all.forEach((l) => {
    byWeek[l.weekIndex] = byWeek[l.weekIndex] || {};
    byWeek[l.weekIndex][l.name] = byWeek[l.weekIndex][l.name] || [];
    byWeek[l.weekIndex][l.name].push(l);
  });
  const weekIdxs = Object.keys(byWeek).map(Number).sort((a, b) => b - a);
  const shownWeeks = conclusionShowAll ? weekIdxs : weekIdxs.slice(0, SHOW_LIMIT);

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
      html += `<div class="compare-row"><div><div class="name">${escapeHtml(name)}</div><div class="vals">بهترین این هفته: ${valLabel}</div></div>${deltaHtml}</div>`;
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
   14) اندازه‌گیری‌های بدن
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
  const latest = all[0];
  const prev = all.find((m) => m.weekIndex < latest.weekIndex);
  function deltaFor(field) {
    if (!prev || latest[field] == null || prev[field] == null) return '';
    const d = latest[field] - prev[field];
    if (d === 0) return '';
    const cls = d < 0 ? 'up' : 'down';
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
   16) بک‌آپ و ریستور داده‌ها
   --------------------------------------------------------- */
async function exportData() {
  try {
    const profile = await dbGetAll('profile');
    const logs = await dbGetAll('logs');
    const measurements = await dbGetAll('measurements');
    
    const backup = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: { profile, logs, measurements }
    };
    
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `خانه-ورز-بک-آپ-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('بک‌آپ دانلود شد');
  } catch (e) {
    console.error('خطا در بک‌آپ:', e);
    showToast('خطا در بک‌آپ');
  }
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    // خواندن فایل
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    
    const backup = JSON.parse(text);
    
    if (backup.version !== 1 || !backup.data) {
      showToast('فایل بک‌آپ نامعتبر است');
      return;
    }
    
    // حذف داده‌های قدیمی و درج جدید
    const db = await openDB();
    
    for (const [storeName, items] of Object.entries(backup.data)) {
      // پاک‌کردن store
      await new Promise((resolve, reject) => {
        const t = db.transaction(storeName, 'readwrite');
        const req = t.objectStore(storeName).clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
      
      // درج items جدید
      for (const item of items) {
        await dbPut(storeName, item);
      }
    }
    
    showToast('داده‌ها بازگرداندند شدند ✓');
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    console.error('خطا در ریستور:', e);
    showToast('خطا در ریستور داده‌ها');
  }
}

/* ---------------------------------------------------------
   17) راه‌اندازی برنامه
   --------------------------------------------------------- */
async function init() {
  buildDayTabs();
  initTabs();
  initSwipe();
  await firstRunSetup();
  document.getElementById('profileForm').addEventListener('submit', saveProfile);
  document.getElementById('exerciseForm').addEventListener('submit', saveExerciseForm);
  document.getElementById('exType').addEventListener('change', toggleExerciseTypeFields);
  document.getElementById('exModalClose').addEventListener('click', closeExerciseModal);
  document.getElementById('measureForm').addEventListener('submit', saveMeasureForm);
  document.getElementById('measureModalClose').addEventListener('click', closeMeasureModal);
  document.getElementById('addMeasureBtn').addEventListener('click', () => openMeasureModal());
  
  // FAB دکمه افزودن حرکت
  document.getElementById('fabAddEx').addEventListener('click', () => openExerciseModal(currentDayIndex));
  
  // دکمه‌های بک‌آپ
  document.getElementById('exportDataBtn').addEventListener('click', exportData);
  document.getElementById('importDataBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change', importData);

  const initialTab = 'day' + currentDayIndex;
  currentTabIndex = TAB_ORDER.indexOf(initialTab);
  switchTab(initialTab);
  renderProfile();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
