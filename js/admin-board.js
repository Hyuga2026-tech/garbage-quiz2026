/* admin-board.js
 * 管理者画面の「ランキング・獲得者の管理」パネル。
 * パスワード画面を通過すると 'admin-unlocked' が届き、同じパスワードで
 * Firebase の管理者アカウントにログインして、一覧の取得・名前変更・削除を行います。
 * ユーザーが入力した名前は必ず textContent / value で扱い、HTMLとして解釈させません。
 */
(function () {
  const statusEl = document.getElementById('board-status');
  const streakListEl = document.getElementById('manage-streaks');
  const certListEl = document.getElementById('manage-certs');
  const bulkEl = document.getElementById('bulk-check');
  const reloadBtn = document.getElementById('board-reload-btn');

  let cloud = null;
  let signedIn = false;
  let streaks = [];
  let certs = [];

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'admin-note' + (kind ? ' ' + kind : '');
  }

  function fmtDate(d) {
    return d ? d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '';
  }

  function explainError(e) {
    const code = (e && e.code) || '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      return '権限がありません。Firestoreのルール（firestore.rules）が最新か、管理者でログインできているか確認してください。';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'Firebase Authentication で「メール/パスワード」ログインが有効になっていません。READMEの手順を確認してください。';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-login-credentials') {
      return '管理者アカウントでログインできません。Firebase Authentication に管理者ユーザーを作成し、パスワードを「gomi-」＋管理者パスワードにしてください（READMEの手順）。';
    }
    if (code === 'auth/too-many-requests') {
      return 'ログインの試行回数が多すぎます。しばらく待ってからやり直してください。';
    }
    if (code === 'auth/network-request-failed' || code === 'unavailable') {
      return '通信できませんでした。ネットワークを確認してください。';
    }
    return '失敗しました（' + (code || (e && e.message) || '不明なエラー') + '）。';
  }

  /* ---------- 一覧の描画 ---------- */

  function buildRow(kind, r) {
    const li = el('li', 'manage-row');
    const who = el('div', 'manage-who');
    const nameEl = el('div', 'manage-name', r.name);
    const detail = kind === 'streaks'
      ? `${r.maxStreak}連続・${r.score}/${r.total}問正解・${fmtDate(r.date)}`
      : `${r.score}/${r.total}問正解・${fmtDate(r.date)}`;
    who.append(nameEl, el('div', 'manage-sub', detail));

    const actions = el('div', 'manage-actions');
    const renameBtn = el('button', 'btn-link', '名前を変更');
    renameBtn.type = 'button';
    const delBtn = el('button', 'btn-icon', '削除');
    delBtn.type = 'button';
    actions.append(renameBtn, delBtn);
    li.append(who, actions);

    renameBtn.addEventListener('click', () => startRename(li, who, nameEl, actions, kind, r));
    delBtn.addEventListener('click', () => doDelete(kind, r));
    return li;
  }

  function renderList(listEl, kind, rows) {
    if (!rows.length) {
      listEl.replaceChildren(el('li', 'manage-empty', '記録はありません。'));
      return;
    }
    listEl.replaceChildren(...rows.map(r => buildRow(kind, r)));
  }

  function renderAll() {
    renderList(streakListEl, 'streaks', streaks);
    renderList(certListEl, 'certs', certs);
  }

  function clearLists(msg) {
    streakListEl.replaceChildren(el('li', 'manage-empty', msg));
    certListEl.replaceChildren(el('li', 'manage-empty', msg));
  }

  /* ---------- 名前変更・削除 ---------- */

  // 「まとめて」にチェックがあれば、同じ名前の記録を両方の一覧から集める
  function targetsFor(kind, row) {
    const list = [{ kind: kind === 'streaks' ? 'streaks' : 'certificates', id: row.id }];
    if (bulkEl.checked) {
      const same = (rows, k) => rows.filter(x => x.name === row.name).map(x => ({ kind: k, id: x.id }));
      const all = [...same(streaks, 'streaks'), ...same(certs, 'certificates')];
      return all;
    }
    return list;
  }

  function startRename(li, who, nameEl, actions, kind, row) {
    const input = el('input', 'manage-input');
    input.type = 'text';
    input.maxLength = 24;
    input.value = row.name;
    input.setAttribute('aria-label', '新しい名前');

    const saveBtn = el('button', 'btn-link', '保存');
    saveBtn.type = 'button';
    const cancelBtn = el('button', 'btn-link manage-cancel', 'キャンセル');
    cancelBtn.type = 'button';

    nameEl.replaceWith(input);
    actions.replaceChildren(saveBtn, cancelBtn);
    input.focus();
    input.select();

    const cancel = () => { renderAll(); };
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
      if (e.key === 'Escape') cancel();
    });

    saveBtn.addEventListener('click', async () => {
      const newName = input.value.trim();
      if (!newName) { setStatus('名前を入力してください。', 'error'); return; }
      if (newName === row.name) { cancel(); return; }
      const targets = targetsFor(kind, row);
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      setStatus('変更しています…');
      try {
        await Promise.all(targets.map(t => cloud.adminRename(t.kind, t.id, newName)));
        setStatus(`名前を変更しました（${targets.length}件）。`, 'saved');
        await loadLists(true);
      } catch (e) {
        console.error(e);
        setStatus(explainError(e), 'error');
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  }

  async function doDelete(kind, row) {
    const targets = targetsFor(kind, row);
    const msg = targets.length > 1
      ? `「${row.name}」の記録を${targets.length}件まとめて削除します。元に戻せません。よろしいですか？`
      : `「${row.name}」の記録を削除します。元に戻せません。よろしいですか？`;
    if (!window.confirm(msg)) return;
    setStatus('削除しています…');
    try {
      await Promise.all(targets.map(t => cloud.adminDelete(t.kind, t.id)));
      setStatus(`削除しました（${targets.length}件）。`, 'saved');
      await loadLists(true);
    } catch (e) {
      console.error(e);
      setStatus(explainError(e), 'error');
    }
  }

  /* ---------- 読み込み・ログイン ---------- */

  async function loadLists(keepStatus) {
    if (!keepStatus) setStatus('読み込み中…');
    try {
      [streaks, certs] = await Promise.all([
        cloud.fetchStreakRanking(200),
        cloud.fetchCertificates(200)
      ]);
      renderAll();
      if (!keepStatus) setStatus('ランキングと獲得者を管理できます。', 'saved');
    } catch (e) {
      console.error(e);
      setStatus(explainError(e), 'error');
    }
  }

  async function onUnlocked(password) {
    if (!cloud || !cloud.enabled) {
      setStatus('Firebase が未設定のため、ランキングの管理はできません（js/firebase-config.js を設定してください）。', 'error');
      clearLists('Firebase が未設定です。');
      return;
    }
    setStatus('管理者としてログインしています…');
    try {
      await cloud.adminSignIn(password);
      signedIn = true;
    } catch (e) {
      console.error(e);
      signedIn = false;
      setStatus(explainError(e), 'error');
      clearLists('ログインできていないため表示できません。');
      return;
    }
    await loadLists(false);
  }

  reloadBtn.addEventListener('click', () => {
    if (!signedIn) { setStatus('ログインできていません。ページを再読み込みして、もう一度ログインしてください。', 'error'); return; }
    loadLists(false);
  });

  window.addEventListener('admin-unlocked', (ev) => {
    const password = ev.detail && ev.detail.password;
    // firebase-service.js（module）の読み込み完了を待つ
    const start = () => { cloud = window.GomiCloud; onUnlocked(password); };
    if (window.GomiCloud) { start(); return; }
    let done = false;
    window.addEventListener('gomicloud-ready', () => { if (!done) { done = true; start(); } }, { once: true });
    setTimeout(() => {
      if (!done && !window.GomiCloud) {
        done = true;
        setStatus('Firebase に接続できませんでした。通信状況を確認して再読み込みしてください。', 'error');
        clearLists('読み込めませんでした。');
      }
    }, 8000);
  });

  // 画面を離れるときはログアウトしておく
  window.addEventListener('pagehide', () => {
    if (signedIn && cloud) cloud.adminSignOut();
  });
})();
