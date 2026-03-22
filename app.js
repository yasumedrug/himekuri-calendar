// ============================================================
//  日めくりカレンダー app.js  (ES Module)
//  PDF.js を動的インポートして PDF を表示する
// ============================================================

// ============================================================
//  設定
// ============================================================
const PDF_PATH      = '日めくりカレンダー.pdf';
const PDF_JS_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const WORKER_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
const CMAP_URL      = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/cmaps/';

// PDF の 1 ページ目 = カレンダー上の何日目か（オフセット調整用）
const PAGE_OFFSET       = 1;           // 1 のとき 1ページ目 = 4月1日
const CALENDAR_START    = new Date(2026, 3, 1);  // 2026-04-01（年度始まり）

// ============================================================
//  状態
// ============================================================
let pdfLib       = null;  // PDF.js module
let pdfDoc       = null;  // 読み込んだ PDFDocument
let currentPage  = 1;
let totalPages   = 365;
let isAnimating  = false;

// ============================================================
//  DOM 参照
// ============================================================
const loadingEl     = document.getElementById('loading');
const prevBtn       = document.getElementById('prev-btn');
const nextBtn       = document.getElementById('next-btn');
const dateLabel     = document.getElementById('date-label');
const datePicker    = document.getElementById('date-picker');
const pageCurrent   = document.getElementById('page-current');
const pageNext      = document.getElementById('page-next');
const canvasCurrent = document.getElementById('canvas-current');
const canvasNext    = document.getElementById('canvas-next');

// ============================================================
//  日付ユーティリティ
// ============================================================
function pageToDate(page) {
  const d = new Date(CALENDAR_START);
  d.setDate(d.getDate() + (page - PAGE_OFFSET));
  return d;
}

function dateToPage(date) {
  const diff = Math.round((date - CALENDAR_START) / 86400000);
  return Math.max(1, Math.min(diff + PAGE_OFFSET, totalPages));
}

function formatDate(date) {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const y    = date.getFullYear();
  const m    = date.getMonth() + 1;
  const d    = date.getDate();
  const w    = days[date.getDay()];
  return `${y}年${m}月${d}日（${w}）`;
}

function toInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function pageDateId(pageNum) {
  const d   = pageToDate(pageNum);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ============================================================
//  PDF レンダリング
// ============================================================
async function renderPageToCanvas(pageNum, canvas) {
  const page   = await pdfDoc.getPage(pageNum);
  const vp0    = page.getViewport({ scale: 1 });
  const maxW   = Math.min(pageCurrent.offsetWidth || 400, 460);
  const scale  = maxW / vp0.width;
  const vp     = page.getViewport({ scale });

  canvas.width  = vp.width;
  canvas.height = vp.height;
  canvas.style.width  = vp.width  + 'px';
  canvas.style.height = vp.height + 'px';

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}

// ============================================================
//  ページ表示（アニメーションなし）
// ============================================================
async function showPage(pageNum) {
  pageNum     = clamp(pageNum, 1, totalPages);
  currentPage = pageNum;

  await renderPageToCanvas(pageNum, canvasCurrent);
  updateUI();
  notifyComments(pageNum);
}

// ============================================================
//  ページめくりアニメーション
// ============================================================
async function navigate(direction) {
  if (isAnimating || !pdfDoc) return;
  const next = currentPage + direction;
  if (next < 1 || next > totalPages) return;

  isAnimating = true;

  // 次ページを先行レンダリング
  pageNext.classList.remove('hidden');
  await renderPageToCanvas(next, canvasNext);

  const outClass = direction > 0 ? 'flip-out-forward'  : 'flip-out-backward';
  const inClass  = direction > 0 ? 'flip-in-forward'   : 'flip-in-backward';

  pageCurrent.classList.remove('current');
  pageCurrent.classList.add(outClass);

  setTimeout(() => {
    pageNext.classList.add(inClass);
  }, 80);

  await delay(620);

  // 描画内容を current に移す
  const ctx = canvasCurrent.getContext('2d');
  canvasCurrent.width       = canvasNext.width;
  canvasCurrent.height      = canvasNext.height;
  canvasCurrent.style.width  = canvasNext.style.width;
  canvasCurrent.style.height = canvasNext.style.height;
  ctx.drawImage(canvasNext, 0, 0);

  // クラスをリセット
  pageCurrent.className = 'page-wrapper current';
  pageNext.className    = 'page-wrapper hidden';

  currentPage = next;
  updateUI();
  notifyComments(next);
  isAnimating = false;
}

// ============================================================
//  UI 更新
// ============================================================
function updateUI() {
  const date           = pageToDate(currentPage);
  dateLabel.textContent = formatDate(date);
  datePicker.value      = toInputValue(date);

  prevBtn.disabled    = currentPage <= 1;
  nextBtn.disabled    = currentPage >= totalPages;
  prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
  nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
}

function notifyComments(pageNum) {
  // firebase.js に対してページ変更を通知（グローバル関数）
  if (typeof window.loadComments === 'function') {
    window.loadComments(pageDateId(pageNum));
  }
}

// ============================================================
//  ユーティリティ
// ============================================================
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
//  イベントリスナー
// ============================================================
prevBtn.addEventListener('click', () => navigate(-1));
nextBtn.addEventListener('click', () => navigate(1));

document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowLeft')  navigate(-1);
  if (e.key === 'ArrowRight') navigate(1);
});

// date input がボタン内に重なっているため、タップで直接開く（スマホ対応）

// date picker で日付選択 → そのページへジャンプ
datePicker.addEventListener('change', async () => {
  if (!datePicker.value || !pdfDoc) return;
  const [y, m, d]  = datePicker.value.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const targetPage = dateToPage(targetDate);
  if (targetPage !== currentPage) await showPage(targetPage);
});

// スワイプ
let touchStartX = 0;
document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) < 50) return;
  navigate(dx < 0 ? 1 : -1);
}, { passive: true });

// ============================================================
//  メイン初期化
// ============================================================
async function main() {
  try {
    // PDF.js を動的インポート
    pdfLib = await import(PDF_JS_URL);
    pdfLib.GlobalWorkerOptions.workerSrc = WORKER_URL;

    // date picker の範囲設定
    datePicker.min = '2026-04-01';
    datePicker.max = '2027-03-31';

    // PDF 読み込み
    const loadingTask = pdfLib.getDocument({
      url:        PDF_PATH,
      cMapUrl:    CMAP_URL,
      cMapPacked: true,
    });
    pdfDoc     = await loadingTask.promise;
    totalPages = pdfDoc.numPages;

    // 今日のページへ自動ジャンプ
    const today     = new Date();
    const todayPage = dateToPage(today);
    await showPage(todayPage);

    loadingEl.classList.add('hidden');

  } catch (err) {
    console.error('初期化エラー:', err);
    const msg = loadingEl.querySelector('p');
    if (msg) {
      msg.textContent =
        'PDFの読み込みに失敗しました。\nサーバー経由で開いてください（例: python3 -m http.server 8080）';
    }
  }
}

main();
