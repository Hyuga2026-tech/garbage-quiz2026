(function () {
  const LOCAL_KEY = 'gomiQuizData';
  const DEFAULT_URL = 'data/questions.json';

  let data = null;

  const listEl = document.getElementById('question-list');
  const qTemplate = document.getElementById('question-template');
  const cTemplate = document.getElementById('choice-template');
  const saveNote = document.getElementById('save-note');

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function setNote(msg, kind) {
    saveNote.textContent = msg;
    saveNote.className = 'admin-note' + (kind ? ' ' + kind : '');
  }

  function noteSaved() {
    setNote('編集中の内容は下書きとして、このブラウザに自動保存されています。「公開する」を押すと、すべての利用者の画面に反映されます。', 'saved');
  }

  function persist() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) { /* 保存できない環境では下書きなしで続行 */ }
    noteSaved();
  }

  // firebase-service.js（module）の準備を待つ。間に合わない場合は null
  function waitForCloud(ms) {
    return new Promise(resolve => {
      if (window.GomiCloud) return resolve(window.GomiCloud);
      const timer = setTimeout(() => resolve(window.GomiCloud || null), ms);
      window.addEventListener('gomicloud-ready', () => { clearTimeout(timer); resolve(window.GomiCloud); }, { once: true });
    });
  }

  const EMPTY_DATA = {
    siteTitle: 'ごみ分別クイズ',
    siteSubtitle: 'まちがえやすい「ごみ分別あるある」に挑戦しよう',
    certificate: { title: 'ごみ分別マスター認定証', message: 'あなたはごみ分別クイズに合格しました。', passPercent: 60 },
    questions: []
  };

  async function fetchDefaults() {
    try {
      const res = await fetch(DEFAULT_URL, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* file:// で開いている場合など */ }
    return null;
  }

  /** 公開中の内容（Firebase）。なければ初期データ。{ data, source } を返す */
  async function loadPublished() {
    const defaults = (await fetchDefaults()) || EMPTY_DATA;
    const cloud = await waitForCloud(4000);
    if (cloud && cloud.enabled) {
      try {
        const published = await cloud.fetchQuiz();
        if (published && published.questions.length) {
          const merged = Object.assign({}, defaults);
          ['siteTitle', 'siteSubtitle', 'certificate'].forEach(k => {
            if (published[k] !== undefined && published[k] !== '') merged[k] = published[k];
          });
          merged.questions = published.questions;
          return { data: merged, source: 'published' };
        }
      } catch (e) {
        console.error('公開中の内容の取得に失敗しました', e);
      }
    }
    return { data: defaults, source: 'default' };
  }

  async function loadInitial() {
    try {
      const draft = JSON.parse(localStorage.getItem(LOCAL_KEY));
      if (draft && Array.isArray(draft.questions)) return { data: draft, source: 'draft' };
    } catch (e) { /* 下書きなし */ }
    return loadPublished();
  }

  /* ---------- 画像：縮小・圧縮して埋め込む ---------- */
  const MAX_IMAGE_CHARS = 450000; // firestore.rules の上限(500000)より少し小さく

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(file);
    });
  }

  async function imageFileToDataUrl(file) {
    const raw = await readAsDataUrl(file);
    if (file.type === 'image/svg+xml') {
      if (raw.length > MAX_IMAGE_CHARS) throw new Error('SVGが大きすぎます');
      return raw; // SVGはそのまま
    }
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('画像として読み込めませんでした'));
      im.src = raw;
    });
    const scale = Math.min(1, 800 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // 透明部分は白にする（JPEG形式にするため）
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= MAX_IMAGE_CHARS) return url;
    }
    throw new Error('画像のサイズが大きすぎます。小さい画像を選んでください');
  }

  function bindSiteFields() {
    const titleInput = document.getElementById('site-title-input');
    const subtitleInput = document.getElementById('site-subtitle-input');
    const certTitleInput = document.getElementById('cert-title-input');
    const certPassInput = document.getElementById('cert-pass-input');
    const certMessageInput = document.getElementById('cert-message-input');

    titleInput.value = data.siteTitle || '';
    subtitleInput.value = data.siteSubtitle || '';
    data.certificate = data.certificate || {};
    certTitleInput.value = data.certificate.title || '';
    certPassInput.value = data.certificate.passPercent != null ? data.certificate.passPercent : 60;
    certMessageInput.value = data.certificate.message || '';

    titleInput.addEventListener('input', () => { data.siteTitle = titleInput.value; persist(); });
    subtitleInput.addEventListener('input', () => { data.siteSubtitle = subtitleInput.value; persist(); });
    certTitleInput.addEventListener('input', () => { data.certificate.title = certTitleInput.value; persist(); });
    certMessageInput.addEventListener('input', () => { data.certificate.message = certMessageInput.value; persist(); });
    certPassInput.addEventListener('input', () => { data.certificate.passPercent = Number(certPassInput.value) || 0; persist(); });
  }

  function renderQuestionList() {
    listEl.innerHTML = '';
    data.questions.forEach((q, idx) => {
      listEl.appendChild(buildQuestionCard(q, idx));
    });
    if (data.questions.length === 0) {
      const empty = document.createElement('p');
      empty.style.color = 'var(--ink-soft)';
      empty.textContent = '問題がありません。「＋ 新しい問題を追加」から作成してください。';
      listEl.appendChild(empty);
    }
  }

  function buildQuestionCard(q, idx) {
    const node = qTemplate.content.cloneNode(true);
    const root = node.querySelector('.q-editor');
    root.dataset.id = q.id;

    node.querySelector('.q-editor-title').textContent = `問題 ${idx + 1}`;

    const textArea = node.querySelector('.f-text');
    textArea.value = q.text || '';
    textArea.addEventListener('input', () => { q.text = textArea.value; persist(); });

    // image
    const preview = node.querySelector('.f-image-preview');
    const pathInput = node.querySelector('.f-image-path');
    const uploadInput = node.querySelector('.f-image-upload');
    const clearBtn = node.querySelector('.f-image-clear');

    function refreshPreview() {
      const isData = !!q.image && q.image.startsWith('data:');
      // アップロード画像は長い文字列になるため、入力欄には注記だけ表示（変更は「画像を削除」から）
      pathInput.readOnly = isData;
      if (isData) pathInput.value = '（アップロードした画像）';
      if (q.image) {
        preview.src = q.image;
        preview.style.visibility = 'visible';
      } else {
        preview.src = '';
        preview.style.visibility = 'hidden';
      }
    }
    pathInput.value = q.image || '';
    refreshPreview();

    pathInput.addEventListener('input', () => {
      q.image = pathInput.value.trim();
      refreshPreview();
      persist();
    });
    uploadInput.addEventListener('change', async () => {
      const file = uploadInput.files[0];
      uploadInput.value = '';
      if (!file) return;
      try {
        q.image = await imageFileToDataUrl(file); // 縮小・圧縮した画像を問題データに埋め込む
        refreshPreview();
        persist();
      } catch (e) {
        alert('画像を取り込めませんでした。' + (e && e.message ? '\n' + e.message : ''));
      }
    });
    clearBtn.addEventListener('click', () => {
      q.image = '';
      pathInput.readOnly = false;
      pathInput.value = '';
      refreshPreview();
      persist();
    });

    // choices
    const choiceList = node.querySelector('.choice-list');
    const addChoiceBtn = node.querySelector('.add-choice');
    const radioName = 'correct-' + q.id;

    function renderChoices() {
      choiceList.innerHTML = '';
      q.choices.forEach((choiceText, ci) => {
        const cNode = cTemplate.content.cloneNode(true);
        const radio = cNode.querySelector('.f-choice-correct');
        const textInput = cNode.querySelector('.f-choice-text');
        const removeBtn = cNode.querySelector('.remove-choice');

        radio.name = radioName;
        radio.checked = q.correctIndex === ci;
        textInput.value = choiceText;
        removeBtn.style.visibility = q.choices.length > 2 ? 'visible' : 'hidden';

        radio.addEventListener('change', () => { q.correctIndex = ci; persist(); });
        textInput.addEventListener('input', () => { q.choices[ci] = textInput.value; persist(); });
        removeBtn.addEventListener('click', () => {
          if (q.choices.length <= 2) return;
          q.choices.splice(ci, 1);
          if (q.correctIndex >= q.choices.length) q.correctIndex = q.choices.length - 1;
          persist();
          renderChoices();
        });

        choiceList.appendChild(cNode);
      });
      addChoiceBtn.style.visibility = q.choices.length >= 3 ? 'hidden' : 'visible';
    }
    renderChoices();

    addChoiceBtn.addEventListener('click', () => {
      if (q.choices.length >= 3) return;
      q.choices.push('');
      persist();
      renderChoices();
    });

    // trivia
    const triviaArea = node.querySelector('.f-trivia');
    triviaArea.value = q.trivia || '';
    triviaArea.addEventListener('input', () => { q.trivia = triviaArea.value; persist(); });

    // delete question
    node.querySelector('.delete-q').addEventListener('click', () => {
      if (!confirm('この問題を削除しますか？')) return;
      data.questions = data.questions.filter(item => item.id !== q.id);
      persist();
      renderQuestionList();
    });

    return node;
  }

  function addQuestion() {
    data.questions.push({
      id: uid(),
      text: '',
      image: '',
      choices: ['', ''],
      correctIndex: 0,
      trivia: ''
    });
    persist();
    renderQuestionList();
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questions.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.questions)) throw new Error('invalid format');
        parsed.questions.forEach(q => { if (!q.id) q.id = uid(); });
        data = parsed;
        persist();
        bindSiteFields();
        renderQuestionList();
        alert('読み込みました。');
      } catch (e) {
        alert('JSONの読み込みに失敗しました。ファイル形式を確認してください。');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- 公開（Firebaseに保存 → 全員の画面に反映） ---------- */

  // 公開前の入力チェック。問題があれば、その内容の一覧を返す
  function validateForPublish() {
    const problems = [];
    if (!data.questions.length) problems.push('問題が1つもありません。');
    data.questions.forEach((q, i) => {
      const n = `問題${i + 1}`;
      if (!String(q.text || '').trim()) problems.push(`${n}：問題文が空です。`);
      if (String(q.text || '').length > 500) problems.push(`${n}：問題文が長すぎます（500文字まで）。`);
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 3) problems.push(`${n}：選択肢は2〜3個にしてください。`);
      else if (q.choices.some(c => !String(c).trim())) problems.push(`${n}：空の選択肢があります。`);
      if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || !q.choices || q.correctIndex >= q.choices.length) problems.push(`${n}：正解が選ばれていません。`);
      if (String(q.trivia || '').length > 1000) problems.push(`${n}：豆知識が長すぎます（1000文字まで）。`);
      if (String(q.image || '').length > 500000) problems.push(`${n}：画像が大きすぎます。`);
    });
    return problems;
  }

  async function publish() {
    const cloud = window.GomiCloud;
    if (!cloud || !cloud.enabled) {
      alert('Firebase が未設定のため公開できません。js/firebase-config.js を設定してください（READMEを参照）。');
      return;
    }
    if (!cloud.isAdminSignedIn()) {
      alert('管理者としてFirebaseにログインできていません。ページを再読み込みして、パスワードを入れ直してください。\n（それでも解決しない場合は、READMEの「管理者アカウントを作る」を確認してください）');
      return;
    }
    const problems = validateForPublish();
    if (problems.length) {
      alert('公開できません。次の点を直してください。\n\n' + problems.slice(0, 10).join('\n') + (problems.length > 10 ? `\n…ほか${problems.length - 10}件` : ''));
      return;
    }
    if (!confirm(`全${data.questions.length}問を公開します。\nすべての利用者の画面が、この内容に切り替わります。よろしいですか？`)) return;

    const btn = document.getElementById('publish-btn');
    btn.disabled = true;
    setNote('公開しています…');
    try {
      await cloud.publishQuiz(data);
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* 無視 */ }
      setNote('公開しました。すべての利用者の画面に反映されます（開いたままの画面は再読み込みすると切り替わります）。', 'saved');
    } catch (e) {
      console.error(e);
      const denied = e && (e.code === 'permission-denied' || e.code === 'firestore/permission-denied');
      setNote(denied
        ? '公開できませんでした：権限がありません。firestore.rules が最新か、管理者でログインできているか確認してください。'
        : '公開できませんでした。通信状況を確認して、もう一度お試しください。', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  const SOURCE_NOTES = {
    draft: '前回の編集内容（下書き）を読み込みました。公開中の内容に戻したいときは「公開中の内容に戻す」を押してください。',
    published: '公開中の内容を読み込みました。',
    default: '初期データを読み込みました（まだ公開されていません）。内容を確認して「公開する」を押してください。'
  };

  function applyLoaded(result) {
    data = result.data;
    data.questions.forEach(q => { if (q.id === undefined || q.id === null || q.id === '') q.id = uid(); });
    bindSiteFields();
    renderQuestionList();
    setNote(SOURCE_NOTES[result.source] || '', result.source === 'default' ? '' : 'saved');
  }

  function init() {
    loadInitial().then(applyLoaded);

    document.getElementById('add-question-btn').addEventListener('click', addQuestion);
    document.getElementById('export-btn').addEventListener('click', exportJson);
    document.getElementById('publish-btn').addEventListener('click', publish);
    // 編集中の下書きを、利用者側の画面（?preview=1）で確認する
    document.getElementById('preview-btn').addEventListener('click', () => window.open('index.html?preview=1', '_blank'));

    document.getElementById('reset-btn').addEventListener('click', async () => {
      if (!confirm('編集中の内容（下書き）を破棄して、公開中の内容を読み込み直しますか？')) return;
      try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* 無視 */ }
      setNote('読み込み中…');
      applyLoaded(await loadPublished());
    });

    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      if (importFile.files[0]) importJson(importFile.files[0]);
      importFile.value = '';
    });
  }

  init();
})();
