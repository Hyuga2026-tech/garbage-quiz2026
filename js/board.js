/* board.js
 * 修了証の獲得者一覧と連続正解ランキングを表示します。
 * 名前などユーザー入力は必ず textContent で挿入し、HTMLとして解釈させません（XSS対策）。
 */
const rankList = document.getElementById('rank-list');
const certList = document.getElementById('cert-list');

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function fmtDate(d) {
  return d ? d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' }) : '';
}

function showMessage(listEl, msg) {
  listEl.replaceChildren(el('li', 'board-empty', msg));
}

function renderRanking(rows) {
  if (!rows.length) return showMessage(rankList, 'まだ登録がありません。最初の1位をめざそう！');
  const items = rows.map((r, i) => {
    const li = el('li');
    const no = el('span', 'rank-no' + (i < 3 ? ' top' + (i + 1) : ''), String(i + 1));
    const who = el('div', 'who');
    who.append(el('div', 'name', r.name), el('div', 'sub', `${r.score}/${r.total}問正解・${fmtDate(r.date)}`));
    const num = el('div', 'big-num', String(r.maxStreak));
    num.append(el('small', null, '連続'));
    li.append(no, who, num);
    return li;
  });
  rankList.replaceChildren(...items);
}

function renderCertificates(rows) {
  if (!rows.length) return showMessage(certList, 'まだ獲得者がいません。あなたが第1号になろう！');
  const items = rows.map(r => {
    const li = el('li');
    const who = el('div', 'who');
    who.append(el('div', 'name', r.name), el('div', 'sub', fmtDate(r.date)));
    const num = el('div', 'big-num', String(r.score));
    num.append(el('small', null, `/${r.total}問`));
    li.append(who, num);
    return li;
  });
  certList.replaceChildren(...items);
}

async function load() {
  const cloud = window.GomiCloud;
  if (!cloud || !cloud.enabled) {
    const msg = 'Firebase が未設定のため表示できません。README の手順で js/firebase-config.js を設定してください。';
    showMessage(rankList, msg);
    showMessage(certList, msg);
    return;
  }
  try {
    const [ranking, certs] = await Promise.all([cloud.fetchStreakRanking(20), cloud.fetchCertificates(50)]);
    renderRanking(ranking);
    renderCertificates(certs);
  } catch (e) {
    console.error(e);
    const msg = '読み込みに失敗しました。時間をおいて再読み込みしてください。';
    showMessage(rankList, msg);
    showMessage(certList, msg);
  }
}

// タブ切り替え
const tabRank = document.getElementById('tab-rank');
const tabCert = document.getElementById('tab-cert');
const panelRank = document.getElementById('panel-rank');
const panelCert = document.getElementById('panel-cert');
function select(which) {
  const isRank = which === 'rank';
  tabRank.classList.toggle('active', isRank);
  tabCert.classList.toggle('active', !isRank);
  tabRank.setAttribute('aria-selected', String(isRank));
  tabCert.setAttribute('aria-selected', String(!isRank));
  panelRank.hidden = !isRank;
  panelCert.hidden = isRank;
}
tabRank.addEventListener('click', () => select('rank'));
tabCert.addEventListener('click', () => select('cert'));

// firebase-service.js（module）の読み込み完了を待ってから実行
if (window.GomiCloud) load();
else {
  window.addEventListener('gomicloud-ready', load, { once: true });
  // Firebase の読み込み自体に失敗した場合（オフライン等）の保険
  setTimeout(() => {
    if (!window.GomiCloud) {
      const msg = 'Firebase に接続できませんでした。通信状況を確認して再読み込みしてください。';
      showMessage(rankList, msg);
      showMessage(certList, msg);
    }
  }, 8000);
}
