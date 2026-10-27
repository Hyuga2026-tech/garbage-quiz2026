(function () {
  const app = document.getElementById('app');
  const LETTERS = ['A', 'B', 'C'];
  const LOCAL_KEY = 'gomiQuizData'; // used for live preview from admin.html on the same browser

  let data = null;
  let order = [];
  let current = 0;
  let score = 0;
  let streak = 0;      // 現在の連続正解数
  let maxStreak = 0;   // この挑戦での最大連続正解数
  let answered = false;
  let certSaved = false;    // 獲得者一覧に登録済みか（二重登録防止）
  let streakSaved = false;  // ランキングに登録済みか

  const cloudOn = () => !!(window.GomiCloud && window.GomiCloud.enabled);

  // firebase-service.js（module）の準備を待つ。間に合わない・失敗した場合は null
  function waitForCloud(ms) {
    return new Promise(resolve => {
      if (window.GomiCloud) return resolve(window.GomiCloud);
      const timer = setTimeout(() => resolve(window.GomiCloud || null), ms);
      window.addEventListener('gomicloud-ready', () => { clearTimeout(timer); resolve(window.GomiCloud); }, { once: true });
    });
  }

  function isUsable(d) {
    return d && Array.isArray(d.questions) && d.questions.length > 0;
  }

  /* 読み込みの優先順位：
   *  1. （?preview=1 のときだけ）管理者画面で編集中の下書き
   *  2. Firebaseに「公開」された問題（全員に共通）
   *  3. data/questions.json（初期データ。Firebase未設定・未公開・通信失敗時の予備） */
  async function loadData() {
    let defaults = null;
    try {
      const res = await fetch('data/questions.json', { cache: 'no-store' });
      if (res.ok) defaults = await res.json();
    } catch (e) { /* 下で別の取得元を試す */ }

    if (new URLSearchParams(location.search).get('preview') === '1') {
      try {
        const draft = JSON.parse(localStorage.getItem(LOCAL_KEY));
        if (isUsable(draft)) return draft;
      } catch (e) { /* 下書きなし */ }
    }

    const cloud = await waitForCloud(4000);
    if (cloud && cloud.enabled) {
      try {
        const published = await cloud.fetchQuiz();
        if (isUsable(published)) {
          // サイト名などが未設定の項目は初期データで補う
          return Object.assign({}, defaults || {}, stripEmpty(published));
        }
      } catch (e) {
        console.error('公開中の問題の取得に失敗したため、初期データを使います', e);
      }
    }
    if (isUsable(defaults)) return defaults;
    throw new Error('no question data available');
  }

  function stripEmpty(obj) {
    const out = {};
    Object.keys(obj).forEach(k => { if (obj[k] !== undefined && obj[k] !== '') out[k] = obj[k]; });
    return out;
  }

  function shuffledIndices(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderStart() {
    document.getElementById('site-title').textContent = data.siteTitle || 'ごみ分別クイズ';
    document.getElementById('site-subtitle').textContent = data.siteSubtitle || '';
    const n = data.questions.length;
    app.innerHTML = `
      <div class="start-card">
        <h2 style="font-size:20px;">全${n}問・2〜3択クイズ</h2>
        <ul>
          <li><span class="dot"></span>まちがえやすい「あるある」問題を出題します</li>
          <li><span class="dot"></span>答えるたびに豆知識をチェックできます</li>
          <li><span class="dot"></span>最後まで解くと修了証がもらえます</li>
          <li><span class="dot"></span>連続正解数ランキングにも挑戦できます</li>
        </ul>
        <div style="margin-top:22px;">
          <button class="btn btn-primary btn-block" id="start-btn">クイズをはじめる</button>
        </div>
        <p id="board-link-wrap" style="text-align:center; margin:16px 0 0; font-size:14px;"></p>
      </div>
    `;
    document.getElementById('start-btn').addEventListener('click', startQuiz);
    showBoardLink();
  }

  // Firebase のモジュールは遅れて読み込まれることがあるため、準備完了後にもリンクを出す
  function showBoardLink() {
    const wrap = document.getElementById('board-link-wrap');
    if (!wrap) return;
    wrap.innerHTML = cloudOn()
      ? '<a href="board.html" style="color:var(--green); font-weight:700;">修了証の獲得者・連続正解ランキングを見る</a>'
      : '';
  }
  window.addEventListener('gomicloud-ready', showBoardLink);

  function startQuiz() {
    order = shuffledIndices(data.questions.length);
    current = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    certSaved = false;
    streakSaved = false;
    renderQuestion();
  }

  function renderProgress() {
    const total = order.length;
    let dots = '';
    for (let i = 0; i < total; i++) {
      const cls = i < current ? 'done' : (i === current ? 'current' : '');
      dots += `<span class="step ${cls}"></span>`;
    }
    const streakLabel = streak >= 2 ? `<span class="streak-badge">${streak}連続正解中</span>` : '';
    return `<div class="progress">${dots}${streakLabel}<span class="label">${current + 1} / ${total}</span></div>`;
  }

  function renderQuestion() {
    answered = false;
    const q = data.questions[order[current]];
    const choicesHtml = q.choices.map((c, i) => `
      <button class="choice" data-index="${i}">
        <span class="mark">${LETTERS[i]}</span>
        <span>${escapeHtml(c)}</span>
      </button>
    `).join('');

    app.innerHTML = `
      ${renderProgress()}
      <div class="q-card">
        ${q.image ? `<img class="q-image" src="${q.image}" alt="">` : ''}
        <div class="q-body">
          <p class="q-text">${escapeHtml(q.text)}</p>
          <div class="choices" id="choices">${choicesHtml}</div>
        </div>
        <div class="feedback" id="feedback" style="display:none;"></div>
      </div>
    `;

    document.querySelectorAll('.choice').forEach(btn => {
      btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index, 10), q));
    });
  }

  function handleAnswer(index, q) {
    if (answered) return;
    answered = true;
    const correct = index === q.correctIndex;
    if (correct) {
      score++;
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 0;
    }

    document.querySelectorAll('.choice').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correctIndex) btn.classList.add('correct');
      if (i === index && !correct) btn.classList.add('wrong');
    });

    const feedback = document.getElementById('feedback');
    feedback.style.display = 'block';
    const isLast = current === order.length - 1;
    const streakNote = correct && streak >= 2 ? `<span class="streak-badge" style="margin-left:8px;">${streak}連続正解！</span>` : '';
    feedback.innerHTML = `
      <span class="result-tag ${correct ? 'ok' : 'ng'}">${correct ? '正解です！' : '残念、不正解'}</span>${streakNote}
      <div class="trivia-box">
        <span class="label">豆知識</span>
        ${escapeHtml(q.trivia || '')}
      </div>
      <div style="margin-top:18px;">
        <button class="btn btn-primary btn-block" id="next-btn">${isLast ? '結果を見る' : '次の問題へ'}</button>
      </div>
    `;
    document.getElementById('next-btn').addEventListener('click', () => {
      if (isLast) {
        renderResult();
      } else {
        current++;
        renderQuestion();
      }
    });
  }

  function renderResult() {
    const total = order.length;
    const percent = Math.round((score / total) * 100);
    const rawPass = data.certificate && data.certificate.passPercent;
    const passPercent = (rawPass === 0 || rawPass) ? Number(rawPass) : 60; // 0%も有効な値として扱う
    const passed = percent >= passPercent;
    // 合格まであと何問か（合格ラインに届く最小の正解数 − 現在の正解数）。届かない設定のときは null
    let needMore = null;
    for (let n = score; n <= total; n++) {
      if (Math.round((n / total) * 100) >= passPercent) { needMore = n - score; break; }
    }
    const cloud = cloudOn();

    // 主ボタン：合格→修了証発行 / 不合格でもFirebaseが有効ならランキング登録
    let primaryBtn = '';
    if (passed) primaryBtn = '<button class="btn btn-primary" id="cert-btn">修了証を発行</button>';
    else if (cloud && maxStreak >= 1) primaryBtn = '<button class="btn btn-primary" id="rank-btn">ランキングに登録</button>';

    const shareBlock = cloud ? `
        <label class="share-check">
          <input type="checkbox" id="share-check" checked>
          <span>${passed ? '獲得者一覧と' : ''}連続正解ランキングにこの名前を公開する<br>
          <small>インターネット上で誰でも見られます。本名ではなくニックネームがおすすめです。</small></span>
        </label>` : '';

    app.innerHTML = `
      <div class="result-card">
        <h2 style="font-size:18px; color:var(--ink-soft);">結果発表</h2>
        <div class="score">${score}<span> / ${total} 問正解</span></div>
        <p class="streak-result">最高連続正解：<strong>${maxStreak}</strong> 問</p>
        <p class="msg">${passed ? 'すばらしい！ごみ分別マスターに認定です。' : (needMore ? `あと${needMore}問で合格です。合格すれば修了証が獲得できます。` : 'もう少し！復習してもう一度挑戦してみましょう。')}</p>
        ${(passed || (cloud && maxStreak >= 1)) ? `
        <div class="name-field">
          <label for="cert-name">${passed ? '修了証に記載するお名前（ニックネーム可）' : 'ランキングに載せるお名前（ニックネーム可）'}</label>
          <input type="text" id="cert-name" placeholder="例）みどりのたろう" maxlength="24">
        </div>
        ${shareBlock}` : ''}

        <div class="action-row">
          <button class="btn btn-ghost" id="retry-btn">もう一度挑戦</button>
          ${primaryBtn}
        </div>
        <p id="cloud-status" class="cloud-status" role="status"></p>
        ${cloud ? '<p style="margin:14px 0 0; font-size:14px;"><a href="board.html" style="color:var(--green); font-weight:700;">獲得者・ランキングを見る</a></p>' : ''}

        <div id="cert-preview" style="margin-top:22px; display:none;">
          <img id="cert-img" style="width:100%; border-radius:12px; box-shadow:var(--shadow);" alt="修了証プレビュー">
          <button class="btn btn-primary btn-block" id="download-btn" style="margin-top:14px;">画像をダウンロード</button>
        </div>
      </div>
    `;

    const statusEl = document.getElementById('cloud-status');
    const setStatus = (msg, isError) => {
      statusEl.textContent = msg;
      statusEl.className = 'cloud-status' + (isError ? ' error' : ' ok');
    };

    // 名前の公開登録（修了証の獲得者一覧／連続正解ランキング）
    async function saveToCloud(name) {
      const shareEl = document.getElementById('share-check');
      if (!cloud || !shareEl || !shareEl.checked) return;
      try {
        if (passed && !certSaved) {
          await window.GomiCloud.addCertificate({ name, score, total });
          certSaved = true;
        }
        if (maxStreak >= 1 && !streakSaved) {
          await window.GomiCloud.addStreak({ name, maxStreak, score, total });
          streakSaved = true;
        }
        setStatus('登録しました。「獲得者・ランキングを見る」から確認できます。', false);
      } catch (e) {
        console.error(e);
        setStatus('登録に失敗しました。通信状況を確認して、もう一度ボタンを押してください。', true);
      }
    }

    document.getElementById('retry-btn').addEventListener('click', renderStart);

    const certBtn = document.getElementById('cert-btn');
    if (certBtn) {
      certBtn.addEventListener('click', async () => {
        const name = document.getElementById('cert-name').value;
        const canvas = document.getElementById('cert-canvas');
        const dateStr = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
        const dataUrl = GomiCertificate.drawCertificate({
          canvas,
          name,
          score,
          total,
          dateStr,
          title: (data.certificate && data.certificate.title) || 'ごみ分別マスター認定証',
          message: (data.certificate && data.certificate.message) || 'あなたはごみ分別クイズに合格しました。'
        });
        document.getElementById('cert-img').src = dataUrl;
        document.getElementById('cert-preview').style.display = 'block';
        document.getElementById('download-btn').onclick = () => GomiCertificate.downloadCertificate(canvas, 'gomi-quiz-certificate.png');

        certBtn.disabled = true;
        await saveToCloud(name);
        // すべて登録できたときだけ無効のままにする（失敗時や未公開時は再実行できる）
        certBtn.disabled = certSaved && (maxStreak < 1 || streakSaved);
      });
    }

    const rankBtn = document.getElementById('rank-btn');
    if (rankBtn) {
      rankBtn.addEventListener('click', async () => {
        const shareEl = document.getElementById('share-check');
        if (shareEl && !shareEl.checked) {
          setStatus('公開にチェックを入れると、ランキングに登録できます。', true);
          return;
        }
        rankBtn.disabled = true;
        await saveToCloud(document.getElementById('cert-name').value);
        if (!streakSaved) rankBtn.disabled = false;
      });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  loadData()
    .then(d => { data = d; renderStart(); })
    .catch(err => {
      app.innerHTML = `<div class="start-card"><p>問題データの読み込みに失敗しました。data/questions.json を確認してください。</p></div>`;
      console.error(err);
    });
})();
