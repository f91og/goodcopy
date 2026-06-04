const state = {
  entries: [],
  selectedId: null,
  draftText: '',
  draftTags: [],
  settings: null
};

const entryList = document.getElementById('entryList');
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const previewEditor = document.getElementById('previewEditor');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const detailPane = document.querySelector('.detail-pane');
const tagList = document.getElementById('tagList');
const tagInput = document.getElementById('tagInput');
const pinButton = document.getElementById('pinButton');
const removeBlankLinesToggle = document.getElementById('removeBlankLinesToggle');
const trimLeadingSpacesToggle = document.getElementById('trimLeadingSpacesToggle');
const shortcutRecordButton = document.getElementById('shortcutRecordButton');
const windowSizeSelect = document.getElementById('windowSizeSelect');
const settingsModal = document.getElementById('settingsModal');
const shortcutLabel = document.querySelector('.shortcut');

function shortcutText(shortcut) {
  return shortcut
    .replace('CommandOrControl', 'Cmd/Ctrl')
    .replace('Command', 'Cmd')
    .replace('Control', 'Ctrl')
    .replaceAll('+', ' ');
}

function readSettingsForm() {
  return {
    removeBlankLines: removeBlankLinesToggle.checked,
    trimLeadingSpaces: trimLeadingSpacesToggle.checked,
    shortcut: shortcutRecordButton.dataset.shortcut || 'Control+P',
    windowSize: windowSizeSelect.value
  };
}

function applySettingsToForm(settings) {
  state.settings = { ...settings };
  removeBlankLinesToggle.checked = Boolean(settings.removeBlankLines);
  trimLeadingSpacesToggle.checked = Boolean(settings.trimLeadingSpaces);
  shortcutRecordButton.dataset.shortcut = settings.shortcut || 'Control+P';
  shortcutRecordButton.textContent = shortcutText(shortcutRecordButton.dataset.shortcut);
  shortcutRecordButton.classList.remove('recording');
  windowSizeSelect.value = settings.windowSize || 'medium';
  document.documentElement.classList.remove('size-small', 'size-medium', 'size-large');
  document.documentElement.classList.add(`size-${windowSizeSelect.value}`);
  shortcutLabel.textContent = shortcutText(shortcutRecordButton.dataset.shortcut);
}

async function saveSettings() {
  const updated = await window.goodcopy.updateSettings(readSettingsForm());
  applySettingsToForm(updated);
  return updated;
}

function applyTextTransforms(text) {
  let nextText = text;

  if (removeBlankLinesToggle.checked) {
    nextText = nextText
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .join('\n');
  }

  if (trimLeadingSpacesToggle.checked) {
    nextText = nextText
      .split('\n')
      .map((line) => line.replace(/^\s+/, ''))
      .join('\n');
  }

  return nextText;
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

function sortedEntries(entries) {
  return [...entries].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }
    return 0;
  });
}

function filteredEntries() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = typeFilter.value;

  return sortedEntries(state.entries.filter((entry) => {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const haystack = `${entry.title || ''} ${entry.text || ''} ${entry.contentType || ''} ${tags.join(' ')}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesType =
      filter === 'all' ||
      (filter === 'text' && entry.contentType === 'Text') ||
      (filter === 'image' && entry.contentType === 'Image') ||
      (filter === 'tagged' && tags.length > 0) ||
      (filter === 'untagged' && tags.length === 0);

    return matchesQuery && matchesType;
  }));
}

function currentFilteredEntries() {
  return filteredEntries();
}

function setDraftFromEntry(entry) {
  state.selectedId = entry?.id || null;
  const isImage = entry?.contentType === 'Image';
  state.draftText = isImage ? '' : applyTextTransforms(entry?.text || '');
  state.draftTags = Array.isArray(entry?.tags) ? [...entry.tags] : [];
  previewEditor.value = state.draftText;
  previewEditor.hidden = isImage;
  imagePreview.hidden = !isImage;
  previewImage.src = isImage && entry.imageUrl ? entry.imageUrl : '';
  detailPane.classList.toggle('image-selected', isImage);
  pinButton.classList.toggle('active', Boolean(entry?.pinned));
  pinButton.textContent = entry?.pinned ? '取消 Pin' : 'Pin';
  renderTags();
}

function selectEntryByOffset(offset) {
  const entries = currentFilteredEntries();
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
  const entry = await saveCurrentEntry();
  if (entry) {
    await window.goodcopy.pasteEntry(entry.id);
  }
}

function renderEntries() {
  const entries = filteredEntries();
  entryList.innerHTML = '';

  if (!entries.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = '没有匹配的剪贴板记录';
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
    tags: state.draftTags,
    pinned: Boolean(entry.pinned)
  });
  if (updated) {
    state.entries = state.entries.map((item) => (item.id === updated.id ? updated : item));
    state.draftText = updated.text;
    state.draftTags = Array.isArray(updated.tags) ? [...updated.tags] : [];
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

async function loadEntries() {
  state.entries = await window.goodcopy.listEntries();
  renderEntries();
}

document.getElementById('closeButton').addEventListener('click', () => {
  window.goodcopy.hideWindow();
});

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
    tags: state.draftTags,
    pinned: !entry.pinned
  });

  if (updated) {
    state.entries = state.entries.map((item) => (item.id === updated.id ? updated : item));
    setDraftFromEntry(updated);
    renderEntries();
  }
});

document.getElementById('settingsButton').addEventListener('click', () => {
  if (state.settings) {
    applySettingsToForm(state.settings);
  }
  settingsModal.hidden = false;
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

document.getElementById('quitAppButton').addEventListener('click', () => {
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
    await window.goodcopy.copyEntry(entry.id);
  }
});

document.getElementById('deleteButton').addEventListener('click', async () => {
  const entry = selectedEntry();
  if (!entry) return;
  state.entries = await window.goodcopy.deleteEntry(entry.id);
  state.selectedId = null;
  renderEntries();
});

previewEditor.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveCurrentEntry();
  }
});

tagInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addTagFromInput();
  }
});

searchInput.addEventListener('input', renderEntries);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    pasteSelectedEntry();
  }
});
typeFilter.addEventListener('change', renderEntries);

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
    document.activeElement !== tagInput
  ) {
    event.preventDefault();
    pasteSelectedEntry();
  }
});

window.goodcopy.onEntriesChanged((entries) => {
  state.entries = entries;
  renderEntries();
});

window.goodcopy.onPanelOpened(() => {
  searchInput.focus();
  searchInput.select();
});

async function boot() {
  applySettingsToForm(await window.goodcopy.getSettings());
  await loadEntries();
  await refreshAccessibilityNotice();
}

boot();
