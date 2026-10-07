(function () {
  const app = document.getElementById('app');
  const LETTERS = ['A', 'B', 'C'];
  const LOCAL_KEY = 'gomiQuizData'; // used for live preview from admin.html on the same browser

  let data = null;
  let order = [];
  let current = 0;
  let score = 0;
  let answered = false;

  async function loadData() {
    const local = localStorage.getItem(LOCAL_KEY);
    if (local) {
      try { return JSON.parse(local); } catch (e) { /* fall through to fetch */ }
    }
    const res = await fetch('data/questions.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('failed to load questions.json');
    return res.json();
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
        </ul>
        <div style="margin-top:22px;">
          <button class="btn btn-primary btn-block" id="start-btn">クイズをはじめる</button>
        </div>
      </div>
    `;
    document.getElementById('start-btn').addEventListener('click', startQuiz);
  }

  function startQuiz() {
    order = shuffledIndices(data.questions.length);
    current = 0;
    score = 0;
    renderQuestion();
  }

  function renderProgress() {
    const total = order.length;
    let dots = '';
    for (let i = 0; i < total; i++) {
      const cls = i < current ? 'done' : (i === current ? 'current' : '');
      dots += `<span class="step ${cls}"></span>`;
    }
    return `<div class="progress">${dots}<span class="label">${current + 1} / ${total}</span></div>`;
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
    if (correct) score++;

    document.querySelectorAll('.choice').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correctIndex) btn.classList.add('correct');
      if (i === index && !correct) btn.classList.add('wrong');
    });

    const feedback = document.getElementById('feedback');
    feedback.style.display = 'block';
    const isLast = current === order.length - 1;
    feedback.innerHTML = `
      <span class="result-tag ${correct ? 'ok' : 'ng'}">${correct ? '正解です！' : '残念、不正解'}</span>
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
    const passPercent = (data.certificate && data.certificate.passPercent) || 60;
    const passed = percent >= passPercent;

    app.innerHTML = `
      <div class="result-card">
        <h2 style="font-size:18px; color:var(--ink-soft);">結果発表</h2>
        <div class="score">${score}<span> / ${total} 問正解</span></div>
        <p class="msg">${passed ? 'すばらしい！ごみ分別マスターに認定です。' : 'もう少し！復習してもう一度挑戦してみましょう。'}</p>

        <div class="name-field">
          <label for="cert-name">修了証に記載するお名前</label>
          <input type="text" id="cert-name" placeholder="例）山田 太郎" maxlength="24">
        </div>

        <div class="action-row">
          <button class="btn btn-ghost" id="retry-btn">もう一度挑戦</button>
          <button class="btn btn-primary" id="cert-btn">修了証を発行</button>
        </div>

        <div id="cert-preview" style="margin-top:22px; display:none;">
          <img id="cert-img" style="width:100%; border-radius:12px; box-shadow:var(--shadow);" alt="修了証プレビュー">
          <button class="btn btn-primary btn-block" id="download-btn" style="margin-top:14px;">画像をダウンロード</button>
        </div>
      </div>
    `;

    document.getElementById('retry-btn').addEventListener('click', renderStart);
    document.getElementById('cert-btn').addEventListener('click', () => {
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
    });
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
