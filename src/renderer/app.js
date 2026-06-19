const state = {
  entries: [],
  selectedId: null,
  draftTags: [],
  draftNote: '',
  settings: null,
  availableTags: [],
  totalEntries: 0,
  hasMoreEntries: false,
  isLoadingEntries: false
};

const ENTRY_PAGE_SIZE = 50;
const entryList = document.getElementById('entryList');
const entryPane = document.querySelector('.entry-pane');
const entryLoadStatus = document.getElementById('entryLoadStatus');
const searchInput = document.getElementById('searchInput');
const tagSuggestions = document.getElementById('tagSuggestions');
const typeFilter = document.getElementById('typeFilter');
const entryContextMenu = document.getElementById('entryContextMenu');
const contextPinButton = document.getElementById('contextPinButton');
const contextTagButton = document.getElementById('contextTagButton');
const contextDeleteButton = document.getElementById('contextDeleteButton');
const transformMenu = document.getElementById('transformMenu');
const transformButton = document.getElementById('transformButton');
const transformOneLineButton = document.getElementById('transformOneLineButton');
const transformRemoveBlankLinesButton = document.getElementById('transformRemoveBlankLinesButton');
const transformTrimLeadingSpacesButton = document.getElementById('transformTrimLeadingSpacesButton');
const transformMaskButton = document.getElementById('transformMaskButton');
const previewEditor = document.getElementById('previewEditor');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const contentPane = document.querySelector('.content');
const paneResizeHandle = document.getElementById('paneResizeHandle');
const detailPane = document.querySelector('.detail-pane');
const tagList = document.getElementById('tagList');
const tagInput = document.getElementById('tagInput');
const noteInput = document.getElementById('noteInput');
const metadataTagSuggestions = document.getElementById('metadataTagSuggestions');
const pinButton = document.getElementById('pinButton');
const darkModeToggle = document.getElementById('darkModeToggle');
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
const shortcutStatus = document.getElementById('shortcutStatus');
const shortcutWarning = document.getElementById('shortcutWarning');
const windowSizeSelect = document.getElementById('windowSizeSelect');
const lineSeparatorButton = document.getElementById('lineSeparatorButton');
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
let isNoteInputComposing = false;
let isTagInputComposing = false;
let isTextCompositionActive = false;
let entryLoadRequestId = 0;
let searchTimer;
let previewSaveTimer;
let previewDirty = false;
let contextMenuEntryId = null;
let suppressTagSuggestions = false;
const PREVIEW_SAVE_DELAY_MS = 500;
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
    fetchGithubPullRequestTitles: fetchGithubPullRequestTitlesToggle.checked,
    aiProvider: aiProviderSelect.value,
    aiInstruction: aiInstructionInput.value,
    shortcut: shortcutRecordButton.dataset.shortcut || 'CommandOrControl+P',
    windowSize: windowSizeSelect.value,
    lineSeparator: lineSeparatorButton.dataset.separator || ' ',
    darkMode: darkModeToggle.checked
  };
}

function applySettingsToForm(settings) {
  state.settings = { ...settings };
  darkModeToggle.checked = Boolean(settings.darkMode);
  fetchGithubPullRequestTitlesToggle.checked = Boolean(settings.fetchGithubPullRequestTitles);
  aiProviderSelect.value = settings.aiProvider || 'none';
  aiInstructionInput.value = settings.aiInstruction || '';
  aiInstructionInput.disabled = true;
  shortcutRecordButton.dataset.shortcut = settings.shortcut || 'CommandOrControl+P';
  shortcutRecordButton.textContent = shortcutText(shortcutRecordButton.dataset.shortcut);
  shortcutRecordButton.classList.remove('recording');
  const registration = settings.shortcutRegistration || {};
  const failedShortcut = registration.failedShortcut ? shortcutText(registration.failedShortcut) : '';
  const activeShortcut = registration.shortcut ? shortcutText(registration.shortcut) : '';
  if (failedShortcut) {
    const message = registration.registered
      ? `无法注册 ${failedShortcut}，可能已被占用。已恢复使用 ${activeShortcut}。`
      : `无法注册 ${failedShortcut}，可能已被占用。请设置新的呼出快捷键。`;
    shortcutStatus.textContent = message;
    shortcutStatus.classList.add('error');
    shortcutWarning.textContent = message;
    shortcutWarning.hidden = false;
  } else {
    shortcutStatus.textContent = registration.registered && activeShortcut
      ? `已启用 ${activeShortcut}`
      : '快捷键尚未注册。';
    shortcutStatus.classList.remove('error');
    shortcutWarning.hidden = true;
    shortcutWarning.textContent = '';
  }
  windowSizeSelect.value = settings.windowSize || 'medium';
  const lineSeparator = settings.lineSeparator || ' ';
  lineSeparatorButton.dataset.separator = lineSeparator;
  lineSeparatorButton.textContent = lineSeparator === ' ' ? 'Space' : lineSeparator;
  lineSeparatorButton.classList.remove('recording');
  document.documentElement.classList.remove('size-small', 'size-medium', 'size-large');
  document.documentElement.classList.add(`size-${windowSizeSelect.value}`);
  document.documentElement.classList.toggle('dark-mode', darkModeToggle.checked);
  renderCachedGithubStatus(settings.githubStatus);
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

  try {
    const status = await window.goodcopy.getGithubStatus();
    state.settings.githubStatus = status;
    renderCachedGithubStatus(status);
    return status;
  } catch (error) {
    console.error('Failed to refresh GitHub status:', error);
    renderCachedGithubStatus(state.settings?.githubStatus);
    githubStatus.textContent = 'GitHub 登录状态检查失败，请重试。';
    return null;
  } finally {
    githubLoginButton.disabled = false;
  }
}

function renderCachedGithubStatus(status) {
  if (!status) {
    githubLoginButton.textContent = '检查状态';
    githubLoginButton.disabled = false;
    githubStatus.textContent = '尚未检查 GitHub CLI 登录状态。GoodCopy 不保存 GitHub token。';
    return;
  }

  githubStatus.textContent = `${status.message}。GoodCopy 不保存 GitHub token。`;
  githubLoginButton.textContent = status.loggedIn
    ? '已登录 · 重新检查'
    : status.installed
      ? '打开终端登录'
      : '未安装 · 重新检查';
  githubLoginButton.disabled = false;
}

function applyTextTransforms(text) {
  return text;
}

function maskContent(text) {
  return String(text || '') ? '...............' : '';
}

function selectedEntry() {
  return state.entries.find((entry) => entry.id === state.selectedId) || null;
}

function entryById(id) {
  return state.entries.find((entry) => entry.id === id) || null;
}

function isEditableKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function isInputMethodComposing(event) {
  return event.isComposing || event.keyCode === 229 || isTextCompositionActive;
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

function renderTagSuggestions() {
  tagSuggestions.innerHTML = '';
  if (suppressTagSuggestions || typeFilter.value !== 'tagged') {
    tagSuggestions.hidden = true;
    return;
  }

  const query = searchInput.value.trim().toLowerCase().replace(/^#/, '');
  const matchingTags = state.availableTags.filter((tag) => tag.toLowerCase().includes(query));
  if (!matchingTags.length) {
    tagSuggestions.hidden = true;
    return;
  }

  for (const tag of matchingTags) {
    const suggestion = document.createElement('button');
    suggestion.type = 'button';
    suggestion.textContent = `#${tag}`;
    suggestion.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    suggestion.addEventListener('click', () => {
      searchInput.value = `#${tag}`;
      tagSuggestions.hidden = true;
      loadEntries({ reset: true });
    });
    tagSuggestions.append(suggestion);
  }
  tagSuggestions.hidden = false;
}

function renderMetadataTagSuggestions() {
  metadataTagSuggestions.innerHTML = '';
  if (document.activeElement !== tagInput) {
    metadataTagSuggestions.hidden = true;
    return;
  }

  const query = tagInput.value.trim().replace(/^#/, '').toLowerCase();
  const currentTagKeys = new Set(state.draftTags.map((tag) => tag.toLowerCase()));
  const matchingTags = state.availableTags.filter(
    (tag) => !currentTagKeys.has(tag.toLowerCase()) && tag.toLowerCase().includes(query)
  );
  if (!matchingTags.length) {
    metadataTagSuggestions.hidden = true;
    return;
  }

  for (const tag of matchingTags) {
    const suggestion = document.createElement('button');
    suggestion.type = 'button';
    suggestion.textContent = `#${tag}`;
    suggestion.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    suggestion.addEventListener('click', () => {
      addMetadataTag(tag);
    });
    metadataTagSuggestions.append(suggestion);
  }
  metadataTagSuggestions.hidden = false;
}

function addMetadataTag(tag) {
  if (!tag || state.draftTags.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
  state.draftTags.push(tag);
  if (!state.availableTags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
    state.availableTags.push(tag);
  }
  tagInput.value = '';
  metadataTagSuggestions.hidden = true;
  renderTags();
  saveCurrentEntry();
}

async function refreshTagSuggestions() {
  state.availableTags = await window.goodcopy.listTags();
  renderTagSuggestions();
  renderMetadataTagSuggestions();
}

function setDraftFromEntry(entry) {
  clearTimeout(previewSaveTimer);
  previewSaveTimer = null;
  previewDirty = false;
  state.selectedId = entry?.id || null;
  const isImage = entry?.contentType === 'Image';
  const isMasked = Boolean(entry?.masked) && !isImage;
  const originalText = applyTextTransforms(entry?.text || '');
  const draftText = isImage ? '' : isMasked ? maskContent(originalText) : originalText;
  state.draftTags = Array.isArray(entry?.tags) ? [...entry.tags] : [];
  state.draftNote = entry?.note || '';
  previewEditor.value = draftText;
  previewEditor.readOnly = isMasked;
  tagInput.value = '';
  noteInput.value = state.draftNote;
  noteInput.readOnly = false;
  metadataTagSuggestions.hidden = true;
  tagInput.disabled = !entry;
  noteInput.disabled = !entry;
  previewEditor.hidden = isImage;
  imagePreview.hidden = !isImage;
  previewImage.src = isImage && entry.imageUrl ? entry.imageUrl : '';
  detailPane.classList.toggle('image-selected', isImage);
  pinButton.classList.toggle('active', Boolean(entry?.pinned));
  pinButton.textContent = entry?.pinned ? '取消 Pin' : 'Pin';
  renderTags();
}

async function selectEntry(entry) {
  if (previewDirty) {
    await flushCurrentEntry();
  }
  setDraftFromEntry(entry);
  renderEntries();
}

async function selectEntryByOffset(offset) {
  const entries = filteredEntries();
  if (!entries.length) return;

  const currentIndex = entries.findIndex((entry) => entry.id === state.selectedId);
  const nextIndex =
    currentIndex === -1
      ? 0
      : Math.max(0, Math.min(entries.length - 1, currentIndex + offset));

  await selectEntry(entries[nextIndex]);
  document.querySelector(`[data-id="${state.selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
}

async function pasteSelectedEntry() {
  const entry = selectedEntry();
  if (!entry) return;

  const isText = entry.contentType === 'Text';
  const text = isText
    ? entry.masked
      ? entry.text || ''
      : applyTextTransforms(previewEditor.value)
    : entry.text || '';
  if (isText && !entry.masked) {
    previewEditor.value = text;
  }

  await window.goodcopy.pasteEntry({
    id: entry.id,
    text,
    note: state.draftNote,
    tags: state.draftTags,
    pinned: Boolean(entry.pinned),
    masked: Boolean(entry.masked)
  });
}

async function pinSelectedEntryToDesktop() {
  const entry = selectedEntry();
  if (!entry) return;
  const displayText =
    entry.contentType === 'Text'
      ? entry.masked
        ? previewEditor.value
        : applyTextTransforms(previewEditor.value)
      : '';
  await window.goodcopy.pinEntryToDesktop({ id: entry.id, displayText });
}

function hideEntryContextMenu() {
  contextMenuEntryId = null;
  entryContextMenu.hidden = true;
}

function hideTransformMenu() {
  transformMenu.hidden = true;
}

function positionFloatingMenu(menu, anchor) {
  menu.hidden = false;

  const anchorBounds = anchor.getBoundingClientRect();
  const { width, height } = menu.getBoundingClientRect();
  const belowTop = anchorBounds.bottom + 8;
  const aboveTop = anchorBounds.top - height - 8;
  const top = belowTop + height > window.innerHeight - 8 && aboveTop > 8 ? aboveTop : belowTop;
  const left = Math.min(anchorBounds.left, window.innerWidth - width - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

function showTransformMenu() {
  hideEntryContextMenu();
  const entry = selectedEntry();
  const transformationsDisabled = !entry || entry.contentType === 'Image' || Boolean(entry.masked);
  transformOneLineButton.disabled = transformationsDisabled;
  transformRemoveBlankLinesButton.disabled = transformationsDisabled;
  transformTrimLeadingSpacesButton.disabled = transformationsDisabled;
  transformMaskButton.textContent = entry?.masked ? '取消遮掩' : '遮掩内容';
  transformMaskButton.disabled = !entry || entry.contentType === 'Image';
  positionFloatingMenu(transformMenu, transformButton);
}

function positionEntryContextMenu(x, y) {
  entryContextMenu.hidden = false;

  const { width, height } = entryContextMenu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - width - 8);
  const top = Math.min(y, window.innerHeight - height - 8);
  entryContextMenu.style.left = `${Math.max(8, left)}px`;
  entryContextMenu.style.top = `${Math.max(8, top)}px`;
}

async function showEntryContextMenu(event, entry) {
  event.preventDefault();
  event.stopPropagation();

  hideTransformMenu();
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  contextMenuEntryId = entry.id;
  contextPinButton.textContent = entry.pinned ? '取消置顶' : '置顶';
  contextTagButton.textContent = tags[0] ? `显示相同 tag: #${tags[0]}` : '显示相同 tag';
  contextTagButton.disabled = !tags.length;
  positionEntryContextMenu(event.clientX, event.clientY);

  if (entry.id === state.selectedId) return;
  if (previewDirty) {
    flushCurrentEntry();
    return;
  }
  setDraftFromEntry(entry);
  renderEntries();
}

function entryNeedsDeleteConfirmation(entry) {
  const tags = Array.isArray(entry?.tags) ? entry.tags : [];
  return tags.length > 0 || Boolean(String(entry?.note || '').trim());
}

async function deleteEntry(entry = selectedEntry(), { confirmProtected = true } = {}) {
  if (!entry) return;
  if (
    confirmProtected &&
    entryNeedsDeleteConfirmation(entry) &&
    !window.confirm('这个 entry 有 tag 或标题，确认删除吗？')
  ) {
    return;
  }
  const entriesBeforeDelete = filteredEntries();
  const deletedIndex = entriesBeforeDelete.findIndex((item) => item.id === entry.id);
  const nextSelectedId =
    deletedIndex > 0
      ? entriesBeforeDelete[deletedIndex - 1]?.id
      : entriesBeforeDelete[deletedIndex + 1]?.id || null;
  const selectedIdAfterDelete = state.selectedId === entry.id ? nextSelectedId : state.selectedId;
  hideEntryContextMenu();
  await window.goodcopy.deleteEntry(entry.id);
  state.selectedId = selectedIdAfterDelete;
  await loadEntries({ reset: true, selectedId: selectedIdAfterDelete });
  setDraftFromEntry(selectedEntry());
  renderEntries();
}

async function toggleEntryPinned(entry = selectedEntry()) {
  if (!entry) return;

  hideEntryContextMenu();
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const updated = await window.goodcopy.updateEntry({
    id: entry.id,
    text:
      entry.contentType === 'Text'
        ? entry.id === state.selectedId
          ? entry.masked
            ? entry.text || ''
            : previewEditor.value
          : entry.text || ''
        : entry.text || '',
    note: entry.id === state.selectedId ? state.draftNote : entry.note || '',
    tags: entry.id === state.selectedId ? state.draftTags : tags,
    pinned: !entry.pinned,
    masked: Boolean(entry.masked)
  });

  if (updated) {
    state.entries = state.entries.map((item) => (item.id === updated.id ? updated : item));
    setDraftFromEntry(updated);
    renderEntries();
  }
}

function showEntriesWithSameTag(entry = selectedEntry()) {
  const tag = Array.isArray(entry?.tags) ? entry.tags[0] : '';
  if (!tag) return;

  hideEntryContextMenu();
  searchInput.value = `#${tag}`;
  typeFilter.value = 'tagged';
  suppressTagSuggestions = true;
  tagSuggestions.hidden = true;
  loadEntries({ reset: true, preserveSelection: true });
}

function applyPreviewTransform(transformer) {
  if (selectedEntry()?.contentType === 'Image' || selectedEntry()?.masked) return;
  hideTransformMenu();
  previewEditor.value = transformer(previewEditor.value);
  previewDirty = true;
  saveCurrentEntry({ applyTransforms: false });
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

    const textWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'entry-title';
    const displayTitle = entry.note || (entry.masked ? maskContent(entry.title) : entry.title);
    title.textContent = `${entry.pinned ? 'Pin · ' : ''}${displayTitle}`;
    textWrap.append(title);

    if (tags.length) {
      const tagLine = document.createElement('div');
      tagLine.className = 'entry-tags';
      tagLine.textContent = tags.map((tag) => `#${tag}`).join(' ');
      textWrap.append(tagLine);
    }

    item.append(textWrap);
    item.addEventListener('click', async () => {
      hideEntryContextMenu();
      await selectEntry(entry);
    });
    item.addEventListener('contextmenu', (event) => {
      showEntryContextMenu(event, entry);
    });
    item.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        await selectEntry(entry);
        if (event.shiftKey) {
          pinSelectedEntryToDesktop();
        } else {
          pasteSelectedEntry();
        }
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

function schedulePreviewSave() {
  previewDirty = true;
  clearTimeout(previewSaveTimer);
  previewSaveTimer = setTimeout(() => {
    previewSaveTimer = null;
    saveCurrentEntry({ applyTransforms: false });
  }, PREVIEW_SAVE_DELAY_MS);
}

function flushCurrentEntry(options) {
  clearTimeout(previewSaveTimer);
  previewSaveTimer = null;
  if (!previewDirty && !options?.force) {
    return Promise.resolve(null);
  }
  return saveCurrentEntry(options);
}

async function saveCurrentEntry({ applyTransforms = true } = {}) {
  const entry = selectedEntry();
  if (!entry) return null;

  const isText = entry.contentType === 'Text';
  const textBeforeSave = entry.masked ? entry.text || '' : previewEditor.value;
  const textToSave = isText && applyTransforms && !entry.masked ? applyTextTransforms(textBeforeSave) : textBeforeSave;
  if (isText && applyTransforms && !entry.masked) {
    previewEditor.value = textToSave;
  }

  const updated = await window.goodcopy.updateEntry({
    id: entry.id,
    text: isText ? textToSave : entry.text || '',
    note: state.draftNote,
    tags: state.draftTags,
    pinned: Boolean(entry.pinned),
    masked: Boolean(entry.masked)
  });
  if (updated) {
    state.entries = state.entries.map((item) => (item.id === updated.id ? updated : item));
    if (state.selectedId === updated.id) {
      if (!isText || previewEditor.value === textToSave) {
        previewDirty = false;
      }
      state.draftTags = Array.isArray(updated.tags) ? [...updated.tags] : [];
      state.draftNote = updated.note || '';
      tagInput.value = '';
      noteInput.value = state.draftNote;
      noteInput.readOnly = false;
    }
    renderEntries();
  }
  return updated;
}

function commitMetadataInput() {
  const value = noteInput.value.trim();
  state.draftNote = value;
  return saveCurrentEntry();
}

function commitTagInput() {
  const value = tagInput.value.trim().replace(/^#/, '').split(/\s+/)[0];
  if (!value) {
    tagInput.value = '';
    metadataTagSuggestions.hidden = true;
    return null;
  }
  addMetadataTag(value);
  return null;
}

async function loadEntries({ reset = false, preserveSelection = false, selectedId = null } = {}) {
  if (state.isLoadingEntries && !reset) return;

  const requestId = reset ? ++entryLoadRequestId : entryLoadRequestId;
  const offset = reset ? 0 : state.entries.length;
  const selectedIdBeforeReset = selectedId || (preserveSelection ? state.selectedId : null);
  state.isLoadingEntries = true;
  if (reset) {
    state.entries = [];
    state.totalEntries = 0;
    state.hasMoreEntries = false;
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
      state.selectedId = result.entries.some((entry) => entry.id === selectedIdBeforeReset)
        ? selectedIdBeforeReset
        : null;
      entryPane.scrollTop = 0;
    }
    renderEntries();
  } finally {
    if (requestId === entryLoadRequestId) {
      state.isLoadingEntries = false;
      renderEntries();
    }
  }
}

transformButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (transformMenu.hidden) {
    showTransformMenu();
  } else {
    hideTransformMenu();
  }
});

transformOneLineButton.addEventListener('click', () => {
  applyPreviewTransform((text) => {
    const separator = state.settings?.lineSeparator || ' ';
    return text
      .replace(/\s*\n+\s*/g, separator)
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  });
});

transformRemoveBlankLinesButton.addEventListener('click', () => {
  applyPreviewTransform((text) => text.split('\n').filter((line) => line.trim().length > 0).join('\n'));
});

transformTrimLeadingSpacesButton.addEventListener('click', () => {
  applyPreviewTransform((text) => text.replace(/^[ \t]+/, ''));
});

transformMaskButton.addEventListener('click', async () => {
  const entry = selectedEntry();
  if (!entry || entry.contentType === 'Image') return;
  hideTransformMenu();

  const updated = await window.goodcopy.updateEntry({
    id: entry.id,
    text: entry.text || '',
    note: state.draftNote,
    tags: state.draftTags,
    pinned: Boolean(entry.pinned),
    masked: !entry.masked
  });
  if (!updated) return;

  state.entries = state.entries.map((item) => (item.id === updated.id ? updated : item));
  setDraftFromEntry(updated);
  renderEntries();
});

pinButton.addEventListener('click', async () => {
  await toggleEntryPinned();
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
    renderCachedGithubStatus(state.settings?.githubStatus);
  }
}

document.getElementById('settingsButton').addEventListener('click', () => {
  openSettings();
});

aiSettingsButton.addEventListener('click', () => {
  openSettings('ai');
});

githubLoginButton.addEventListener('click', async () => {
  const status = await refreshGithubStatus();
  if (!status) return;
  if (status.loggedIn) {
    return;
  }
  if (!status.installed) return;

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

function stopShortcutRecording() {
  shortcutRecordButton.classList.remove('recording');
  shortcutRecordButton.textContent = shortcutText(shortcutRecordButton.dataset.shortcut || 'CommandOrControl+P');
}

shortcutRecordButton.addEventListener('keydown', (event) => {
  if (!shortcutRecordButton.classList.contains('recording')) return;

  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    stopShortcutRecording();
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

shortcutRecordButton.addEventListener('blur', () => {
  if (shortcutRecordButton.classList.contains('recording')) {
    stopShortcutRecording();
  }
});

function stopLineSeparatorRecording() {
  const separator = lineSeparatorButton.dataset.separator || ' ';
  lineSeparatorButton.classList.remove('recording');
  lineSeparatorButton.textContent = separator === ' ' ? 'Space' : separator;
}

lineSeparatorButton.addEventListener('click', () => {
  lineSeparatorButton.classList.add('recording');
  lineSeparatorButton.textContent = '按键...';
  lineSeparatorButton.focus();
});

lineSeparatorButton.addEventListener('keydown', (event) => {
  if (!lineSeparatorButton.classList.contains('recording')) return;

  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    stopLineSeparatorRecording();
    return;
  }
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;

  const separator = event.key === ' ' ? ' ' : Array.from(event.key).length === 1 ? event.key : '';
  if (!separator) {
    lineSeparatorButton.textContent = '需单个符号';
    return;
  }
  lineSeparatorButton.dataset.separator = separator;
  stopLineSeparatorRecording();
});

lineSeparatorButton.addEventListener('blur', () => {
  if (lineSeparatorButton.classList.contains('recording')) {
    stopLineSeparatorRecording();
  }
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

document.getElementById('deleteButton').addEventListener('click', async () => {
  await deleteEntry();
});

contextPinButton.addEventListener('click', async () => {
  await toggleEntryPinned(entryById(contextMenuEntryId));
});

contextTagButton.addEventListener('click', () => {
  showEntriesWithSameTag(entryById(contextMenuEntryId));
});

contextDeleteButton.addEventListener('click', async () => {
  await deleteEntry(entryById(contextMenuEntryId));
});

entryContextMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});

transformMenu.addEventListener('click', (event) => {
  event.stopPropagation();
});

document.addEventListener('click', () => {
  hideEntryContextMenu();
  hideTransformMenu();
});

previewEditor.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    flushCurrentEntry();
  }
});

previewEditor.addEventListener('input', () => {
  schedulePreviewSave();
});

previewEditor.addEventListener('blur', () => {
  flushCurrentEntry({ applyTransforms: false });
});

noteInput.addEventListener('compositionstart', () => {
  isNoteInputComposing = true;
});

noteInput.addEventListener('compositionend', () => {
  isNoteInputComposing = false;
});

noteInput.addEventListener('input', () => {
  state.draftNote = noteInput.value.trim();
});

noteInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing && !isNoteInputComposing && event.keyCode !== 229) {
    event.preventDefault();
    commitMetadataInput();
  }
});

noteInput.addEventListener('blur', () => {
  commitMetadataInput();
});

tagInput.addEventListener('compositionstart', () => {
  isTagInputComposing = true;
});

tagInput.addEventListener('compositionend', () => {
  isTagInputComposing = false;
});

tagInput.addEventListener('input', () => {
  renderMetadataTagSuggestions();
});

tagInput.addEventListener('focus', () => {
  renderMetadataTagSuggestions();
});

tagInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing && !isTagInputComposing && event.keyCode !== 229) {
    event.preventDefault();
    commitTagInput();
  }
});

tagInput.addEventListener('blur', () => {
  metadataTagSuggestions.hidden = true;
  commitTagInput();
});

searchInput.addEventListener('input', () => {
  suppressTagSuggestions = false;
  renderTagSuggestions();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    loadEntries({ reset: true });
  }, 180);
});
searchInput.addEventListener('focus', () => {
  renderTagSuggestions();
});
searchInput.addEventListener('blur', () => {
  tagSuggestions.hidden = true;
});
searchInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter' && !isInputMethodComposing(event)) {
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
      await loadEntries({ reset: true });
    }
    if (event.shiftKey) {
      pinSelectedEntryToDesktop();
    } else {
      pasteSelectedEntry();
    }
  }
});
typeFilter.addEventListener('change', async () => {
  suppressTagSuggestions = false;
  await refreshTagSuggestions();
  loadEntries({ reset: true });
});

document.addEventListener(
  'compositionstart',
  () => {
    isTextCompositionActive = true;
  },
  true
);

document.addEventListener(
  'compositionend',
  () => {
    isTextCompositionActive = false;
  },
  true
);

entryPane.addEventListener('scroll', () => {
  hideEntryContextMenu();
  hideTransformMenu();
  const distanceFromBottom = entryPane.scrollHeight - entryPane.scrollTop - entryPane.clientHeight;
  if (distanceFromBottom < 160 && state.hasMoreEntries && !state.isLoadingEntries) {
    loadEntries();
  }
});

window.addEventListener('resize', () => {
  hideEntryContextMenu();
  hideTransformMenu();
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
    if (!transformMenu.hidden) {
      hideTransformMenu();
      return;
    }
    if (!entryContextMenu.hidden) {
      hideEntryContextMenu();
      return;
    }
    window.goodcopy.hideWindow();
    return;
  }

  const canNavigateEntries =
    !isInputMethodComposing(event) &&
    (!isEditableKeyboardTarget(event.target) || event.target === searchInput);

  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    event.metaKey &&
    !isInputMethodComposing(event) &&
    settingsModal.hidden
  ) {
    event.preventDefault();
    deleteEntry(selectedEntry(), { confirmProtected: true });
    return;
  }

  if (event.key === 'ArrowDown' && canNavigateEntries) {
    event.preventDefault();
    selectEntryByOffset(1);
    return;
  }

  if (event.key === 'ArrowUp' && canNavigateEntries) {
    event.preventDefault();
    selectEntryByOffset(-1);
    return;
  }

  if (
    event.key === 'Enter' &&
    event.shiftKey &&
    !event.repeat &&
    !isInputMethodComposing(event) &&
    settingsModal.hidden
  ) {
    event.preventDefault();
    pinSelectedEntryToDesktop();
    return;
  }

  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !isInputMethodComposing(event) &&
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
  if (typeFilter.value === 'tagged') {
    refreshTagSuggestions();
  }
  if (change?.type === 'updated' && change.entry) {
    if (searchInput.value.trim() || typeFilter.value !== 'all') {
      loadEntries({ reset: true, preserveSelection: true });
      refreshStorageUsage();
      return;
    }
    const index = state.entries.findIndex((entry) => entry.id === change.entry.id);
    if (index !== -1) {
      state.entries[index] = change.entry;
      if (
        state.selectedId === change.entry.id &&
        document.activeElement !== tagInput &&
        document.activeElement !== noteInput
      ) {
        state.draftTags = Array.isArray(change.entry.tags) ? [...change.entry.tags] : [];
        state.draftNote = change.entry.note || '';
        tagInput.value = '';
        noteInput.value = state.draftNote;
        noteInput.readOnly = false;
      }
      renderEntries();
    }
  } else {
    loadEntries({ reset: true, preserveSelection: previewDirty || document.activeElement === previewEditor });
  }
  refreshStorageUsage();
});

window.goodcopy.onPanelOpened(async () => {
  typeFilter.value = 'all';
  searchInput.value = '';
  suppressTagSuggestions = false;
  tagSuggestions.hidden = true;
  await loadEntries({ reset: true });
  await refreshTagSuggestions();
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
