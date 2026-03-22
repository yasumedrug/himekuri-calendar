// ============================================================
//  firebase.js  — コメント機能（Firebase Firestore）
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDLrC21HTOyy8K-MRPvHEcBCiJkPF9_uj0",
  authDomain: "himekuri-calendar-2026.firebaseapp.com",
  projectId: "himekuri-calendar-2026",
  storageBucket: "himekuri-calendar-2026.firebasestorage.app",
  messagingSenderId: "774810257558",
  appId: "1:774810257558:web:c5205ff50627b909badab7"
};

let db            = null;
let unsubscribe   = null;
let currentDateId = null;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  console.log('Firebase 接続成功');
} catch (err) {
  console.warn('Firebase 未設定のためローカルモードで動作します:', err.message);
}

const commentList    = document.getElementById('comment-list');
const noComment      = document.getElementById('no-comment');
const commentText    = document.getElementById('comment-text');
const commentNick    = document.getElementById('comment-nickname');
const commentSubmit  = document.getElementById('comment-submit');
const nicknameModal  = document.getElementById('nickname-modal');
const nicknameInput  = document.getElementById('nickname-input');
const nicknameSubmit = document.getElementById('nickname-submit');

function getNickname() {
  return localStorage.getItem('calendar_nickname') || '';
}

function setNickname(name) {
  localStorage.setItem('calendar_nickname', name);
  commentNick.value = name;
}

function initNickname() {
  const saved = getNickname();
  if (saved) {
    commentNick.value = saved;
  } else {
    nicknameModal.classList.remove('hidden');
    nicknameInput.focus();
  }
}

nicknameSubmit.addEventListener('click', () => {
  const name = nicknameInput.value.trim();
  if (!name) return;
  setNickname(name);
  nicknameModal.classList.add('hidden');
});

nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') nicknameSubmit.click();
});

commentNick.addEventListener('click', () => {
  nicknameInput.value = getNickname();
  nicknameModal.classList.remove('hidden');
  nicknameInput.focus();
});

function loadComments(dateId) {
  currentDateId = dateId;
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  clearCommentList();

  if (!db) { loadLocalComments(dateId); return; }

  const ref = db.collection('comments').doc(dateId).collection('messages').orderBy('createdAt', 'asc');
  unsubscribe = ref.onSnapshot((snapshot) => {
    clearCommentList();
    if (snapshot.empty) { noComment.style.display = 'block'; return; }
    noComment.style.display = 'none';
    snapshot.forEach((doc) => renderComment({ id: doc.id, ...doc.data() }));
  }, (err) => console.error('コメント読み込みエラー:', err));
}

async function submitComment() {
  const text   = commentText.value.trim();
  const author = getNickname();
  if (!text)   { commentText.focus(); return; }
  if (!author) { nicknameModal.classList.remove('hidden'); return; }

  const data = { text, author, createdAt: new Date().toISOString() };
  commentText.value = '';
  commentSubmit.disabled = true;

  if (!db) {
    saveLocalComment(currentDateId, data);
    loadLocalComments(currentDateId);
    commentSubmit.disabled = false;
    return;
  }

  try {
    await db.collection('comments').doc(currentDateId).collection('messages').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('コメント投稿エラー:', err);
    renderComment(data);
    noComment.style.display = 'none';
  } finally {
    commentSubmit.disabled = false;
  }
}

commentSubmit.addEventListener('click', submitComment);
commentText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
});

function clearCommentList() {
  commentList.querySelectorAll('.comment-item').forEach(el => el.remove());
  noComment.style.display = 'block';
}

function renderComment(data) {
  noComment.style.display = 'none';
  const item = document.createElement('div');
  item.className = 'comment-item';
  const timeStr  = formatCommentTime(data.createdAt);
  const isOwn    = data.author === getNickname();
  const deleteBtn = isOwn
    ? `<button class="comment-delete-btn" data-id="${escapeHtml(data.id || '')}" title="削除">🗑</button>`
    : '';
  item.innerHTML = `
    <div class="comment-item-header">
      <span class="comment-author">${escapeHtml(data.author)}</span>
      <span class="comment-time">${timeStr}</span>
      ${deleteBtn}
    </div>
    <p class="comment-text">${escapeHtml(data.text)}</p>
  `;
  if (isOwn) {
    item.querySelector('.comment-delete-btn').addEventListener('click', () => {
      deleteComment(data.id, data._localIndex);
    });
  }
  commentList.appendChild(item);
}

async function deleteComment(docId, localIndex) {
  if (!confirm('このコメントを削除しますか？')) return;

  if (!db) {
    // ローカルストレージから削除
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    if (all[currentDateId] && localIndex !== undefined) {
      all[currentDateId].splice(localIndex, 1);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
      loadLocalComments(currentDateId);
    }
    return;
  }

  try {
    await db.collection('comments').doc(currentDateId).collection('messages').doc(docId).delete();
  } catch (err) {
    console.error('削除エラー:', err);
    alert('削除に失敗しました');
  }
}

function formatCommentTime(createdAt) {
  if (!createdAt) return '';
  const d = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  if (isNaN(d.getTime())) return '';
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h   = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const LOCAL_KEY = 'calendar_comments';

function saveLocalComment(dateId, data) {
  const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  if (!all[dateId]) all[dateId] = [];
  all[dateId].push(data);
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

function loadLocalComments(dateId) {
  const all      = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  const comments = all[dateId] || [];
  clearCommentList();
  if (comments.length === 0) { noComment.style.display = 'block'; return; }
  noComment.style.display = 'none';
  comments.forEach((c, i) => renderComment({ ...c, _localIndex: i }));
}

initNickname();
