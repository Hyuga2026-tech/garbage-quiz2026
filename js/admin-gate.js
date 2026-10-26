/* admin-gate.js
 * 管理者ページのパスワード画面。
 *
 * 【重要】この画面は「画面を隠すだけ」の入口です。静的サイトのため、ページのコードは
 * 誰でも読めるので、これだけでは本当の防御になりません。
 * ランキングの削除・名前変更は、Firebase Authentication のログインとセキュリティルール
 * （firestore.rules）で別途守られています。
 *
 * パスワードを変えるとき：
 *  1. ブラウザの開発者ツール（F12）のコンソールで  GomiAdminHash("新しいパスワード")  を実行
 *  2. 表示された数字を、下の ADMIN_GATE_HASH に貼り付ける
 *  3. Firebase Authentication の管理者ユーザーのパスワードを  gomi-新しいパスワード  に変更
 */
(function () {
  // 現在のパスワードのハッシュ値（パスワード自体はここには書かれていません）
  const ADMIN_GATE_HASH = '4796427406049950';

  // 軽量な文字列ハッシュ（cyrb53）
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return String(4294967296 * (2097151 & h2) + (h1 >>> 0));
  }
  window.GomiAdminHash = pw => hash('gomi-quiz-admin:' + String(pw));

  const gate = document.getElementById('gate');
  const main = document.getElementById('admin-main');
  const form = document.getElementById('gate-form');
  const input = document.getElementById('gate-input');
  const btn = document.getElementById('gate-btn');
  const errEl = document.getElementById('gate-error');

  let failures = 0;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const pw = input.value;
    if (window.GomiAdminHash(pw) === ADMIN_GATE_HASH) {
      errEl.textContent = '';
      gate.hidden = true;
      main.hidden = false;
      input.value = '';
      // ランキング管理パネルへ通知（同じパスワードでFirebaseにもログインする）
      window.dispatchEvent(new CustomEvent('admin-unlocked', { detail: { password: pw } }));
    } else {
      failures++;
      errEl.textContent = 'パスワードが違います。';
      input.value = '';
      input.focus();
      // 続けて試されにくくするため、間違えるたびに待ち時間を延ばす
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, Math.min(1000 * failures, 8000));
    }
  });
})();
