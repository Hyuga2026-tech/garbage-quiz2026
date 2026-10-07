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

  function noteSaved() {
    saveNote.textContent = '変更内容は自動的に保存されています（このブラウザ内）。エクスポートを忘れずに。';
    saveNote.classList.add('saved');
  }

  function persist() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    noteSaved();
  }

  async function loadInitial() {
    const local = localStorage.getItem(LOCAL_KEY);
    if (local) {
      try { return JSON.parse(local); } catch (e) { /* ignore */ }
    }
    try {
      const res = await fetch(DEFAULT_URL, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (e) { /* likely opened via file:// - fall through */ }
    return {
      siteTitle: 'ごみ分別クイズ',
      siteSubtitle: 'まちがえやすい「ごみ分別あるある」に挑戦しよう',
      certificate: { title: 'ごみ分別マスター認定証', message: 'あなたはごみ分別クイズに合格しました。', passPercent: 60 },
      questions: []
    };
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
    uploadInput.addEventListener('change', () => {
      const file = uploadInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        q.image = reader.result; // data URL, embedded directly in the JSON
        pathInput.value = q.image;
        refreshPreview();
        persist();
      };
      reader.readAsDataURL(file);
    });
    clearBtn.addEventListener('click', () => {
      q.image = '';
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

  function init() {
    loadInitial().then(d => {
      data = d;
      data.questions.forEach(q => { if (!q.id) q.id = uid(); });
      bindSiteFields();
      renderQuestionList();
    });

    document.getElementById('add-question-btn').addEventListener('click', addQuestion);
    document.getElementById('export-btn').addEventListener('click', exportJson);
    document.getElementById('preview-btn').addEventListener('click', () => window.open('index.html', '_blank'));

    document.getElementById('reset-btn').addEventListener('click', () => {
      if (!confirm('現在の編集内容を破棄して、リポジトリ内の data/questions.json を読み込み直しますか？')) return;
      localStorage.removeItem(LOCAL_KEY);
      fetch(DEFAULT_URL, { cache: 'no-store' }).then(r => r.json()).then(d => {
        data = d;
        data.questions.forEach(q => { if (!q.id) q.id = uid(); });
        bindSiteFields();
        renderQuestionList();
        persist();
      }).catch(() => alert('data/questions.json の読み込みに失敗しました。'));
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
