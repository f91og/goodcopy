const state = {
  entries: [],
  selectedId: null,
  draftTags: [],
  draftNote: '',
  settings: null,
  totalEntries: 0,
  hasMoreEntries: false,
  isLoadingEntries: false
};

const ENTRY_PAGE_SIZE = 50;
const entryList = document.getElementById('entryList');
const entryPane = document.querySelector('.entry-pane');
const entryLoadStatus = document.getElementById('entryLoadStatus');
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const previewEditor = document.getElementById('previewEditor');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const contentPane = document.querySelector('.content');
const paneResizeHandle = document.getElementById('paneResizeHandle');
const detailPane = document.querySelector('.detail-pane');
const tagList = document.getElementById('tagList');
const tagInput = document.getElementById('tagInput');
const noteInput = document.getElementById('noteInput');
const pinButton = document.getElementById('pinButton');
const removeBlankLinesToggle = document.getElementById('removeBlankLinesToggle');
const trimLeadingSpacesToggle = document.getElementById('trimLeadingSpacesToggle');
const fetchGithubPullRequestTitlesToggle = document.getElementById('fetchGithubPullRequestTitlesToggle');
const githubLoginButton = document.getElementById('githubLoginButton');
const githubStatus = document.getElementById('githubStatus');
const aiProviderSelect = document.getElementById('aiProviderSelect');
const aiLoginButton = document.getElementById('aiLoginButton');
const aiStatus = document.getElementById('aiStatus');
const aiInstructionInput = document.getElementById('aiInstructionInput');
const aiTestButton = document.getElementById('aiTestButton');
const aiSettingsButton = document.getElementById('aiSettingsButton');
const shortcutRecordButton = document.getElementById('shortcutRecordButton');
const windowSizeSelect = document.getElementById('windowSizeSelect');
const settingsModal = document.getElementById('settingsModal');
const settingsTitle = document.getElementById('settingsTitle');
const generalSettingsBody = document.getElementById('generalSettingsBody');
const aiSettingsBody = document.getElementById('aiSettingsBody');
const quitAppButton = document.getElementById('quitAppButton');
const accessibilityButton = document.getElementById('accessibilityButton');
const accessibilityStatus = document.getElementById('accessibilityStatus');
const storageUsage = document.getElementById('storageUsage');
const clearUntaggedButton = document.getElementById('clearUntaggedButton');
const clearUntaggedStatus = document.getElementById('clearUntaggedStatus');
let isTagInputComposing = false;
let entryLoadRequestId = 0;
let searchTimer;
const PANE_WIDTH_STORAGE_KEY = 'goodcopy.entryPaneWidth';
const DEFAULT_ENTRY_PANE_RATIO = 0.38;
const MIN_ENTRY_PANE_WIDTH = 220;
const MIN_DETAIL_PANE_WIDTH = 320;

function clampEntryPaneWidth(width) {
  const availableWidth = contentPane.clientWidth - paneResizeHandle.offsetWidth;
  const maximumWidth = Math.max(MIN_ENTRY_PANE_WIDTH, availableWidth - MIN_DETAIL_PANE_WIDTH);
  return Math.min(Math.max(width, MIN_ENTRY_PANE_WIDTH), maximumWidth);
}

function setEntryPaneWidth(width, persist = false) {
  const nextWidth = clampEntryPaneWidth(width);
  contentPane.style.setProperty('--entry-pane-width', `${nextWidth}px`);
  paneResizeHandle.setAttribute('aria-valuenow', String(Math.round(nextWidth)));
  if (persist) {
    localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(Math.round(nextWidth)));
  }
}

function restoreEntryPaneWidth() {
  const storedWidth = Number(localStorage.getItem(PANE_WIDTH_STORAGE_KEY));
  const defaultWidth = contentPane.clientWidth * DEFAULT_ENTRY_PANE_RATIO;
  setEntryPaneWidth(Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : defaultWidth);
}

paneResizeHandle.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  paneResizeHandle.setPointerCapture(event.pointerId);
  contentPane.classList.add('resizing');
});

paneResizeHandle.addEventListener('pointermove', (event) => {
  if (!paneResizeHandle.hasPointerCapture(event.pointerId)) return;
  const contentBounds = contentPane.getBoundingClientRect();
  setEntryPaneWidth(event.clientX - contentBounds.left);
});

paneResizeHandle.addEventListener('pointerup', (event) => {
  if (!paneResizeHandle.hasPointerCapture(event.pointerId)) return;
  paneResizeHandle.releasePointerCapture(event.pointerId);
  contentPane.classList.remove('resizing');
  const entryPaneWidth = Number.parseFloat(getComputedStyle(contentPane).getPropertyValue('--entry-pane-width'));
  setEntryPaneWidth(entryPaneWidth, true);
});

paneResizeHandle.addEventListener('pointercancel', () => {
  contentPane.classList.remove('resizing');
});

paneResizeHandle.addEventListener('dblclick', () => {
  localStorage.removeItem(PANE_WIDTH_STORAGE_KEY);
  setEntryPaneWidth(contentPane.clientWidth * DEFAULT_ENTRY_PANE_RATIO);
});

paneResizeHandle.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const currentWidth = paneResizeHandle.getBoundingClientRect().left - contentPane.getBoundingClientRect().left;
  const direction = event.key === 'ArrowLeft' ? -1 : 1;
  const step = event.shiftKey ? 40 : 10;
  setEntryPaneWidth(currentWidth + direction * step, true);
});

window.addEventListener('resize', () => {
  const currentWidth = paneResizeHandle.getBoundingClientRect().left - contentPane.getBoundingClientRect().left;
  setEntryPaneWidth(currentWidth);
});

function shortcutText(shortcut) {
  return shortcut
    .replace('CommandOrControl', 'Cmd/Ctrl')
    .replace('Command', 'Cmd')
    .replace('Control', 'Ctrl')
    .replaceAll('+', ' ');
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 || size >= 10 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function storageText(usage) {
  return `存储 ${formatBytes(usage?.bytes)} · ${usage?.entries || 0} 条`;
}

async function refreshStorageUsage() {
  const usage = await window.goodcopy.getStorageUsage();
  storageUsage.textContent = storageText(usage);
  return usage;
}

function readSettingsForm() {
  return {
    removeBlankLines: removeBlankLinesToggle.checked,
    trimLeadingSpaces: trimLeadingSpacesToggle.checked,
    fetchGithubPullRequestTitles: fetchGithubPullRequestTitlesToggle.checked,
    aiProvider: aiProviderSelect.value,
    aiInstruction: aiInstructionInput.value,
    shortcut: shortcutRecordButton.dataset.shortcut || 'Control+P',
    windowSize: windowSizeSelect.value
  };
}

function applySettingsToForm(settings) {
  state.settings = { ...settings };
  removeBlankLinesToggle.checked = Boolean(settings.removeBlankLines);
  trimLeadingSpacesToggle.checked = Boolean(settings.trimLeadingSpaces);
  fetchGithubPullRequestTitlesToggle.checked = Boolean(settings.fetchGithubPullRequestTitles);
  aiProviderSelect.value = settings.aiProvider || 'none';
  aiInstructionInput.value = settings.aiInstruction || '';
  aiInstructionInput.disabled = true;
  shortcutRecordButton.dataset.shortcut = settings.shortcut || 'Control+P';
  shortcutRecordButton.textContent = shortcutText(shortcutRecordButton.dataset.shortcut);
  shortcutRecordButton.classList.remove('recording');
  windowSizeSelect.value = settings.windowSize || 'medium';
  document.documentElement.classList.remove('size-small', 'size-medium', 'size-large');
  document.documentElement.classList.add(`size-${windowSizeSelect.value}`);
}

async function saveSettings() {
  const updated = await window.goodcopy.updateSettings(readSettingsForm());
  applySettingsToForm(updated);
  return updated;
}

async function refreshAccessibilityStatus() {
  const result = await window.goodcopy.getAccessibilityStatus();
  const trusted = typeof result === 'boolean' ? result : Boolean(result?.trusted);
  const status = typeof result === 'object' ? result.status : trusted ? 'authorized' : 'denied';
  const electronStatus = result?.electronTrusted ? 'authorized' : 'denied';
  accessibilityButton.textContent = trusted ? '已授权' : '打开系统设置';
  accessibilityButton.classList.toggle('recording', trusted);
  accessibilityStatus.textContent = trusted
    ? `辅助功能权限已开启。系统：${electronStatus}，底层：${status || 'unknown'}。`
    : `当前状态：系统 ${electronStatus}，底层 ${status || 'unknown'}。打开系统设置后请给 GoodCopy 开启权限。`;
  return trusted;
}

async function refreshAiStatus() {
  const provider = aiProviderSelect.value;
  aiLoginButton.disabled = provider === 'none';
  aiInstructionInput.disabled = true;
  aiTestButton.disabled = true;
  aiLoginButton.textContent = provider === 'none' ? '未启用' : '检查中...';
  aiStatus.textContent = provider === 'none' ? '选择 Codex 或 Claude 后，可复用本机 CLI 登录。' : '正在检查登录状态...';

  if (provider === 'none') return null;

  const status = await window.goodcopy.getAiStatus(provider);
  aiStatus.textContent = `${status.message}。GoodCopy 不保存账号或 token。`;
  aiLoginButton.textContent = status.loggedIn ? '已登录 · 重新检查' : status.installed ? '打开终端登录' : '未安装';
  aiLoginButton.disabled = !status.installed;
  aiInstructionInput.disabled = !status.loggedIn;
  aiTestButton.disabled = !status.loggedIn;
  return status;
}

async function refreshGithubStatus() {
  githubLoginButton.disabled = true;
  githubLoginButton.textContent = '检查中...';
  githubStatus.textContent = '正在检查 GitHub CLI 登录状态...';

  const status = await window.goodcopy.getGithubStatus();
  githubStatus.textContent = `${status.message}。GoodCopy 不保存 GitHub token。`;
  githubLoginButton.textContent = status.loggedIn ? '已登录 · 重新检查' : status.installed ? '打开终端登录' : '未安装';
  githubLoginButton.disabled = !status.installed;
  return status;
}

function applyTextTransforms(text) {
  let lines = text.split('\n');

  if (removeBlankLinesToggle.checked) {
    lines = lines.filter((line) => line.trim().length > 0);
  }

  if (trimLeadingSpacesToggle.checked && lines.length) {
    lines[0] = lines[0].replace(/^[ \t]+/, '');
  }

  return lines.join('\n');
}

function selectedEntry() {
  return state.entries.find((entry) => entry.id === state.selectedId) || null;
}

function keyToAcceleratorKey(event) {
  if (/^[a-z]$/i.test(event.key)) return event.key.toUpperCase();
  if (/^[0-9]$/.test(event.key)) return event.key;

  const namedKeys = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Enter: 'Enter',
    Return: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab'
  };

  if (namedKeys[event.key]) return namedKeys[event.key];
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key;
  if (event.code?.startsWith('Digit')) return event.code.replace('Digit', '');
  if (event.code?.startsWith('Key')) return event.code.replace('Key', '');
  return '';
}

function eventToShortcut(event) {
  const key = keyToAcceleratorKey(event);
  const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta'];
  if (!key || modifierKeys.includes(event.key)) return '';

  const parts = [];
  if (event.metaKey) parts.push('Command');
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  if (!parts.length) return '';
  parts.push(key);
  return [...new Set(parts)].join('+');
}

function filteredEntries() {
  return state.entries;
}

function setDraftFromEntry(entry) {
  state.selectedId = entry?.id || null;
  const isImage = entry?.contentType === 'Image';
  const draftText = isImage ? '' : applyTextTransforms(entry?.text || '');
  state.draftTags = Array.isArray(entry?.tags) ? [...entry.tags] : [];
  state.draftNote = entry?.note || '';
  previewEditor.value = draftText;
  noteInput.value = state.draftNote;
  noteInput.disabled = !entry;
  previewEditor.hidden = isImage;
  imagePreview.hidden = !isImage;
  previewImage.src = isImage && entry.imageUrl ? entry.imageUrl : '';
  detailPane.classList.toggle('image-selected', isImage);
  pinButton.classList.toggle('active', Boolean(entry?.pinned));
  pinButton.textContent = entry?.pinned ? '取消 Pin' : 'Pin';
  renderTags();
}

function selectEntryByOffset(offset) {
  const entries = filteredEntries();
  if (!entries.length) return;

  const currentIndex = entries.findIndex((entry) => entry.id === state.selectedId);
  const nextIndex =
    currentIndex === -1
      ? 0
      : Math.max(0, Math.min(entries.length - 1, currentIndex + offset));

  setDraftFromEntry(entries[nextIndex]);
  renderEntries();
  document.querySelector(`[data-id="${state.selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
}

async function pasteSelectedEntry() {
  const entry = selectedEntry();
  if (!entry) return;

  const isText = entry.contentType === 'Text';
  const text = isText ? applyTextTransforms(previewEditor.value) : entry.text || '';
  if (isText) {
    previewEditor.value = text;
  }

  await window.goodcopy.pasteEntry({
    id: entry.id,
    text,
    note: state.draftNote,
    tags: state.draftTags,
    pinned: Boolean(entry.pinned)
  });
}

function renderEntries() {
  const entries = filteredEntries();
  entryList.innerHTML = '';
  renderEntryLoadStatus();

  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = state.isLoadingEntries ? '正在加载...' : '没有匹配的剪贴板记录';
    entryList.append(empty);
    setDraftFromEntry(null);
    return;
  }

  if (!state.selectedId || !entries.some((entry) => entry.id === state.selectedId)) {
    setDraftFromEntry(entries[0]);
  }

  for (const entry of entries) {
    const item = document.createElement('li');
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    item.className = `entry-item${entry.id === state.selectedId ? ' selected' : ''}`;
    item.tabIndex = 0;
    item.dataset.id = entry.id;

    let icon;
    if (entry.contentType === 'Image' && entry.imageUrl) {
      icon = document.createElement('img');
      icon.className = 'entry-thumb';
      icon.src = entry.imageUrl;
      icon.alt = '';
    } else {
      icon = document.createElement('span');
      icon.className = 'entry-icon';
      icon.setAttribute('aria-hidden', 'true');
    }

    const textWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'entry-title';
    title.textContent = `${entry.pinned ? 'Pin · ' : ''}${entry.title}`;
    textWrap.append(title);

    if (entry.note) {
      const noteLine = document.createElement('div');
      noteLine.className = 'entry-note';
      noteLine.textContent = entry.note;
      textWrap.append(noteLine);
    }

    if (tags.length) {
      const tagLine = document.createElement('div');
      tagLine.className = 'entry-tags';
      tagLine.textContent = tags.map((tag) => `#${tag}`).join(' ');
      textWrap.append(tagLine);
    }

    item.append(icon, textWrap);
    item.addEventListener('click', () => {
      setDraftFromEntry(entry);
      renderEntries();
    });
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        setDraftFromEntry(entry);
        pasteSelectedEntry();
      }
    });
    entryList.append(item);
  }
}

function renderEntryLoadStatus() {
  if (state.isLoadingEntries) {
    entryLoadStatus.textContent = '加载中...';
    return;
  }
  if (state.hasMoreEntries) {
    entryLoadStatus.textContent = `已加载 ${state.entries.length} / ${state.totalEntries}，继续滚动加载`;
    return;
  }
  entryLoadStatus.textContent = state.totalEntries ? `已加载全部 ${state.totalEntries} 条` : '';
}

function renderTags() {
  tagList.innerHTML = '';

  for (const tag of state.draftTags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.title = `移除 ${tag}`;
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.draftTags = state.draftTags.filter((item) => item !== tag);
      renderTags();
      saveCurrentEntry();
    });

    chip.append(remove);
    tagList.append(chip);
  }
}

async function saveCurrentEntry() {
  const entry = selectedEntry();
  if (!entry) return null;

  const isText = entry.contentType === 'Text';
  const transformedText = isText ? applyTextTransforms(previewEditor.value) : entry.text || '';
  if (isText) {
    previewEditor.value = transformedText;
  }

  const updated = await window.goodcopy.updateEntry({
    id: entry.id,
    text: transformedText,
    note: state.draftNote,
    tags: state.draftTags,
    pinned: Boolean(entry.pinned)
  });
  if (updated) {
    state.entries = state.entries.map((item) => (item.id === updated.id ? updated : item));
    state.draftTags = Array.isArray(updated.tags) ? [...updated.tags] : [];
    state.draftNote = updated.note || '';
    noteInput.value = state.draftNote;
    renderEntries();
  }
  return updated;
}

function addTagFromInput() {
  const tag = tagInput.value.trim().replace(/^#/, '');
  if (!tag || state.draftTags.includes(tag)) {
    tagInput.value = '';
    return;
  }

  state.draftTags.push(tag);
  tagInput.value = '';
  renderTags();
  saveCurrentEntry();
}

async function loadEntries({ reset = false } = {}) {
  if (state.isLoadingEntries && !reset) return;

  const requestId = reset ? ++entryLoadRequestId : entryLoadRequestId;
  const offset = reset ? 0 : state.entries.length;
  state.isLoadingEntries = true;
  if (reset) {
    state.entries = [];
    state.totalEntries = 0;
    state.hasMoreEntries = false;
    renderEntries();
  }
  renderEntryLoadStatus();

  try {
    const result = await window.goodcopy.listEntries({
      offset,
      limit: ENTRY_PAGE_SIZE,
      query: searchInput.value,
      filter: typeFilter.value
    });
    if (requestId !== entryLoadRequestId) return;

    state.entries = reset ? result.entries : [...state.entries, ...result.entries];
    state.totalEntries = result.total;
    state.hasMoreEntries = result.hasMore;
    if (reset) {
      state.selectedId = null;
      entryPane.scrollTop = 0;
    }
    renderEntries();
  } finally {
    if (requestId === entryLoadRequestId) {
      state.isLoadingEntries = false;
      renderEntryLoadStatus();
    }
  }
}

document.getElementById('oneLineButton').addEventListener('click', () => {
  if (selectedEntry()?.contentType === 'Image') return;
  previewEditor.value = previewEditor.value.replace(/\s*\n+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
  saveCurrentEntry();
});

pinButton.addEventListener('click', async () => {
  const entry = selectedEntry();
  if (!entry) return;

  const updated = await window.goodcopy.updateEntry({
    id: entry.id,
    text: entry.contentType === 'Text' ? previewEditor.value : entry.text || '',
    note: state.draftNote,
    tags: state.draftTags,
    pinned: !entry.pinned
  });

  if (updated) {
    state.entries = state.entries.map((item) => (item.id === updated.id ? updated : item));
    setDraftFromEntry(updated);
    renderEntries();
  }
});

function openSettings(view = 'general') {
  if (state.settings) {
    applySettingsToForm(state.settings);
  }
  const isAiView = view === 'ai';
  settingsTitle.textContent = isAiView ? 'AI' : '设置';
  generalSettingsBody.hidden = isAiView;
  aiSettingsBody.hidden = !isAiView;
  quitAppButton.hidden = isAiView;
  settingsModal.hidden = false;
  if (isAiView) {
    refreshAiStatus();
  } else {
    refreshAccessibilityStatus();
    refreshGithubStatus();
  }
}

document.getElementById('settingsButton').addEventListener('click', () => {
  openSettings();
});

aiSettingsButton.addEventListener('click', () => {
  openSettings('ai');
});

githubLoginButton.addEventListener('click', async () => {
  const status = await window.goodcopy.getGithubStatus();
  if (status.loggedIn) {
    await refreshGithubStatus();
    return;
  }

  const result = await window.goodcopy.loginGithub();
  githubStatus.textContent = result.message;
  if (result.ok) {
    setTimeout(refreshGithubStatus, 3000);
  }
});

aiProviderSelect.addEventListener('change', refreshAiStatus);

aiLoginButton.addEventListener('click', async () => {
  const status = await window.goodcopy.getAiStatus(aiProviderSelect.value);
  if (status.loggedIn) {
    await refreshAiStatus();
    return;
  }

  const result = await window.goodcopy.loginAi(aiProviderSelect.value);
  aiStatus.textContent = result.message;
  if (result.ok) {
    setTimeout(refreshAiStatus, 3000);
  }
});

aiTestButton.addEventListener('click', async () => {
  aiTestButton.disabled = true;
  aiTestButton.textContent = '测试中...';
  aiStatus.textContent = '正在调用 AI，请稍候...';

  try {
    const result = await window.goodcopy.testAi(aiProviderSelect.value);
    if (result.ok) {
      aiStatus.textContent = `AI 测试成功：${result.response}`;
    } else {
      aiStatus.textContent = result.message;
    }
  } catch (error) {
    aiStatus.textContent = error?.message || 'AI 测试失败';
  } finally {
    aiTestButton.textContent = '测试 AI';
    aiTestButton.disabled = aiInstructionInput.disabled;
  }
});

shortcutRecordButton.addEventListener('click', () => {
  shortcutRecordButton.classList.add('recording');
  shortcutRecordButton.textContent = '按下快捷键...';
  shortcutRecordButton.focus();
});

shortcutRecordButton.addEventListener('keydown', (event) => {
  if (!shortcutRecordButton.classList.contains('recording')) return;

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    shortcutRecordButton.classList.remove('recording');
    shortcutRecordButton.textContent = shortcutText(shortcutRecordButton.dataset.shortcut || 'Control+P');
    return;
  }

  const shortcut = eventToShortcut(event);
  if (!shortcut) {
    shortcutRecordButton.textContent = '需要组合键';
    return;
  }

  shortcutRecordButton.dataset.shortcut = shortcut;
  shortcutRecordButton.textContent = shortcutText(shortcut);
  shortcutRecordButton.classList.remove('recording');
});

accessibilityButton.addEventListener('click', async () => {
  const trusted = await refreshAccessibilityStatus();
  if (trusted) return;

  await window.goodcopy.requestAccessibility();
  setTimeout(refreshAccessibilityStatus, 600);
});

clearUntaggedButton.addEventListener('click', async () => {
  const confirmed = window.confirm('确认删除所有没有 tag 的历史记录？已打 tag 的记录会保留。');
  if (!confirmed) return;

  clearUntaggedButton.disabled = true;
  clearUntaggedStatus.textContent = '正在清理...';

  try {
    const result = await window.goodcopy.clearUntaggedEntries();
    state.selectedId = null;
    await loadEntries({ reset: true });
    storageUsage.textContent = storageText(result.storage);
    clearUntaggedStatus.textContent = `已清除 ${result.removed} 条 untagged 历史记录。`;
  } finally {
    clearUntaggedButton.disabled = false;
  }
});

document.getElementById('settingsCloseButton').addEventListener('click', () => {
  if (state.settings) {
    applySettingsToForm(state.settings);
  }
  settingsModal.hidden = true;
});

document.getElementById('settingsSaveButton').addEventListener('click', async () => {
  await saveSettings();
  previewEditor.value = applyTextTransforms(previewEditor.value);
  await saveCurrentEntry();
  settingsModal.hidden = true;
});

quitAppButton.addEventListener('click', () => {
  window.goodcopy.quitApp();
});

settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) {
    if (state.settings) {
      applySettingsToForm(state.settings);
    }
    settingsModal.hidden = true;
  }
});

document.getElementById('pasteButton').addEventListener('click', async () => {
  await pasteSelectedEntry();
});

document.getElementById('copyButton').addEventListener('click', async () => {
  const entry = await saveCurrentEntry();
  if (entry) {
    const copied = await window.goodcopy.copyEntry(entry.id);
    if (copied) {
      window.goodcopy.hideWindow();
    }
  }
});

document.getElementById('deleteButton').addEventListener('click', async () => {
  const entry = selectedEntry();
  if (!entry) return;
  await window.goodcopy.deleteEntry(entry.id);
  state.selectedId = null;
  await loadEntries({ reset: true });
});

previewEditor.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveCurrentEntry();
  }
});

tagInput.addEventListener('compositionstart', () => {
  isTagInputComposing = true;
});

tagInput.addEventListener('compositionend', () => {
  isTagInputComposing = false;
});

tagInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing && !isTagInputComposing && event.keyCode !== 229) {
    event.preventDefault();
    addTagFromInput();
  }
});

noteInput.addEventListener('input', () => {
  state.draftNote = noteInput.value.trim();
});

noteInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    saveCurrentEntry();
  }
});

noteInput.addEventListener('blur', () => {
  saveCurrentEntry();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadEntries({ reset: true });
  }, 180);
});
searchInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(searchTimer);
    await loadEntries({ reset: true });
    pasteSelectedEntry();
  }
});
typeFilter.addEventListener('change', () => {
  loadEntries({ reset: true });
});

entryPane.addEventListener('scroll', () => {
  const distanceFromBottom = entryPane.scrollHeight - entryPane.scrollTop - entryPane.clientHeight;
  if (distanceFromBottom < 160 && state.hasMoreEntries && !state.isLoadingEntries) {
    loadEntries();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settingsModal.hidden) {
    if (state.settings) {
      applySettingsToForm(state.settings);
    }
    settingsModal.hidden = true;
    return;
  }

  if (event.key === 'Escape') {
    window.goodcopy.hideWindow();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectEntryByOffset(1);
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectEntryByOffset(-1);
    return;
  }

  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    settingsModal.hidden &&
    document.activeElement !== previewEditor &&
    document.activeElement !== tagInput &&
    document.activeElement !== noteInput
  ) {
    event.preventDefault();
    pasteSelectedEntry();
  }
});

window.goodcopy.onEntriesChanged((change) => {
  if (change?.type === 'updated' && change.entry) {
    if (searchInput.value.trim() || typeFilter.value !== 'all') {
      loadEntries({ reset: true });
      refreshStorageUsage();
      return;
    }
    const index = state.entries.findIndex((entry) => entry.id === change.entry.id);
    if (index !== -1) {
      state.entries[index] = change.entry;
      if (state.selectedId === change.entry.id && document.activeElement !== noteInput) {
        state.draftNote = change.entry.note || '';
        noteInput.value = state.draftNote;
      }
      renderEntries();
    }
  } else {
    loadEntries({ reset: true });
  }
  refreshStorageUsage();
});

window.goodcopy.onPanelOpened(async () => {
  await loadEntries({ reset: true });
  searchInput.focus();
  searchInput.select();
});

async function boot() {
  restoreEntryPaneWidth();
  applySettingsToForm(await window.goodcopy.getSettings());
  await loadEntries({ reset: true });
  await refreshStorageUsage();
}

boot();
