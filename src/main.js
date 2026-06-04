const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, nativeImage } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');

let mainWindow;
let entries = [];
let lastClipboardText = '';
let lastClipboardImageHash = '';
let storePath = '';
let settingsPath = '';
let imageDir = '';
let previousFrontmostAppId = '';
let writeStoreTimer;
let isQuitting = false;

const MAX_ENTRIES = 300;
const MAX_RENDERER_ENTRIES = 120;
const CLIPBOARD_POLL_MS = 800;
const IMAGE_CLIPBOARD_POLL_MS = 1600;
let lastImageClipboardCheck = 0;
const DEFAULT_SETTINGS = {
  removeBlankLines: false,
  trimLeadingSpaces: false,
  shortcut: 'Control+P',
  windowSize: 'medium'
};

const WINDOW_SIZES = {
  small: { width: 900, height: 580 },
  medium: { width: 1000, height: 640 },
  large: { width: 1220, height: 780 }
};

let settings = { ...DEFAULT_SETTINGS };

app.setName('GoodCopy');

function normalizeShortcut(shortcut) {
  const fallback = DEFAULT_SETTINGS.shortcut;
  const raw = String(shortcut || fallback).trim();
  if (!raw) return fallback;

  return raw.replaceAll('CommandOrControl', process.platform === 'darwin' ? 'Command' : 'Control');
}

function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n');
}

function titleFromText(text) {
  const compact = normalizeText(text).replace(/\s+/g, ' ').trim();
  return compact.length > 42 ? `${compact.slice(0, 42)}...` : compact || 'Untitled';
}

function titleFromImage(size) {
  if (!size?.width || !size?.height) return 'Image';
  return `Image ${size.width} x ${size.height}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toRendererEntry(entry) {
  return {
    ...entry,
    imageUrl: entry.imagePath ? pathToFileURL(entry.imagePath).href : null
  };
}

function toRendererEntries() {
  return entries.slice(0, MAX_RENDERER_ENTRIES).map(toRendererEntry);
}

function emitEntriesChanged() {
  mainWindow?.webContents.send('entries-changed', toRendererEntries());
}

async function readStore() {
  try {
    const raw = await fs.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed.entries)
      ? parsed.entries.map((entry) => ({
          ...entry,
          contentType: entry.contentType || 'Text',
          tags: Array.isArray(entry.tags) ? entry.tags : [],
          pinned: Boolean(entry.pinned)
        }))
      : [];
    lastClipboardText = entries.find((entry) => entry.contentType === 'Text')?.text || '';
    lastClipboardImageHash = entries.find((entry) => entry.contentType === 'Image')?.imageHash || '';
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to read clipboard store:', error);
    }
    entries = [];
  }
}

async function readSettings() {
  try {
    const raw = await fs.readFile(settingsPath, 'utf8');
    settings = {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(raw)
    };
    settings.shortcut = normalizeShortcut(settings.shortcut);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to read settings:', error);
    }
    settings = { ...DEFAULT_SETTINGS };
    settings.shortcut = normalizeShortcut(settings.shortcut);
  }
}

async function writeSettings() {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

function applyWindowSize() {
  if (!mainWindow) return;
  const size = WINDOW_SIZES[settings.windowSize] || WINDOW_SIZES.medium;
  mainWindow.setMinimumSize(680, 440);
  mainWindow.setSize(size.width, size.height, false);
  mainWindow.center();
}

async function writeStoreNow() {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify({ entries }, null, 2), 'utf8');
}

function writeStore() {
  clearTimeout(writeStoreTimer);
  return new Promise((resolve, reject) => {
    writeStoreTimer = setTimeout(() => {
      writeStoreNow().then(resolve, reject);
    }, 180);
  });
}

async function flushStore() {
  clearTimeout(writeStoreTimer);
  if (storePath) {
    await writeStoreNow();
  }
}

function trimEntries() {
  if (entries.length <= MAX_ENTRIES) return;

  const removed = entries.slice(MAX_ENTRIES);
  entries = entries.slice(0, MAX_ENTRIES);

  for (const entry of removed) {
    if (entry.contentType === 'Image' && entry.imagePath) {
      fs.unlink(entry.imagePath).catch(() => {});
    }
  }
}

async function addClipboardText(text, source = 'Clipboard') {
  const normalized = normalizeText(text).trimEnd();
  if (!normalized.trim()) return null;

  const existingIndex = entries.findIndex((entry) => entry.text === normalized);
  if (existingIndex === 0) return entries[0];

  const existing = existingIndex > -1 ? entries.splice(existingIndex, 1)[0] : null;
  const entry = {
    id: existing?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: 'text',
    text: normalized,
    title: titleFromText(normalized),
    tags: existing?.tags || [],
    pinned: Boolean(existing?.pinned),
    source: existing?.source || source,
    contentType: 'Text',
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  entries.unshift(entry);
  trimEntries();
  await writeStore();
  emitEntriesChanged();
  return entry;
}

async function addClipboardImage(image, source = 'Clipboard') {
  if (!image || image.isEmpty()) return null;

  const pngBuffer = image.toPNG();
  if (!pngBuffer.length) return null;

  const imageHash = crypto.createHash('sha256').update(pngBuffer).digest('hex');
  const existingIndex = entries.findIndex((entry) => entry.contentType === 'Image' && entry.imageHash === imageHash);
  if (existingIndex === 0) return entries[0];

  const existing = existingIndex > -1 ? entries.splice(existingIndex, 1)[0] : null;
  const id = existing?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const imagePath = existing?.imagePath || path.join(imageDir, `${id}.png`);
  const size = image.getSize();

  await fs.mkdir(imageDir, { recursive: true });
  if (!existing?.imagePath) {
    await fs.writeFile(imagePath, pngBuffer);
  }

  const entry = {
    id,
    type: 'image',
    text: '',
    title: existing?.title || titleFromImage(size),
    tags: existing?.tags || [],
    pinned: Boolean(existing?.pinned),
    source: existing?.source || source,
    contentType: 'Image',
    imagePath,
    imageHash,
    width: size.width,
    height: size.height,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  entries.unshift(entry);
  trimEntries();
  await writeStore();
  emitEntriesChanged();
  return entry;
}

function createWindow() {
  const size = WINDOW_SIZES[settings.windowSize] || WINDOW_SIZES.medium;
  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    minWidth: 680,
    minHeight: 440,
    useContentSize: false,
    show: false,
    frame: false,
    title: 'GoodCopy',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#eeeeee',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { windowSize: settings.windowSize }
  });
  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });
}

function captureFrontmostAppId() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve('');
      return;
    }

    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'],
      (error, stdout) => {
        if (error) {
          resolve('');
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

async function togglePanel() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }

  applyWindowSize();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('panel-opened');
  captureFrontmostAppId().then((appId) => {
    previousFrontmostAppId = appId;
  });
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const registered = globalShortcut.register(settings.shortcut, togglePanel);
  if (!registered) {
    console.warn(`${settings.shortcut} global shortcut registration failed.`);
  }
  return registered;
}

function pasteWithAppleScript(targetAppId = '') {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve(false);
      return;
    }

    const script = targetAppId
      ? [
          `tell application id "${targetAppId}" to activate`,
          'delay 0.08',
          'tell application "System Events" to keystroke "v" using command down'
        ].join('\n')
      : 'tell application "System Events" to keystroke "v" using command down';

    execFile('osascript', ['-e', script], (error) => {
      if (error) {
        console.error('Automatic paste failed:', error);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    togglePanel();
  });

  app.whenReady().then(async () => {
  storePath = path.join(app.getPath('userData'), 'entries.json');
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  imageDir = path.join(app.getPath('userData'), 'images');
  await readSettings();
  await readStore();
  createWindow();
  registerShortcuts();

  setInterval(() => {
    const formats = clipboard.availableFormats();
    const hasImage = formats.some((format) => format.startsWith('image/'));
    const now = Date.now();

    if (!hasImage) {
      const currentText = normalizeText(clipboard.readText());
      if (currentText && currentText !== lastClipboardText) {
        lastClipboardText = currentText;
        addClipboardText(currentText).catch((error) => console.error('Failed to capture clipboard:', error));
      }
      return;
    }

    if (now - lastImageClipboardCheck < IMAGE_CLIPBOARD_POLL_MS) {
      return;
    }
    lastImageClipboardCheck = now;

    const currentImage = clipboard.readImage();
    if (!currentImage.isEmpty()) {
      const imageHash = crypto.createHash('sha256').update(currentImage.toPNG()).digest('hex');
      if (imageHash && imageHash !== lastClipboardImageHash) {
        lastClipboardImageHash = imageHash;
        addClipboardImage(currentImage).catch((error) => console.error('Failed to capture clipboard image:', error));
      }
      return;
    }
  }, CLIPBOARD_POLL_MS);

  app.dock?.hide();
  });
}

async function quitApp() {
  if (isQuitting) return;
  isQuitting = true;
  globalShortcut.unregisterAll();
  try {
    await flushStore();
  } catch (error) {
    console.error('Failed to flush clipboard store:', error);
  }
  app.exit(0);
}

app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  quitApp();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('entries:list', () => toRendererEntries());

ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:update', async (_event, nextSettings) => {
  const previousSettings = { ...settings };
  settings = {
    ...settings,
    removeBlankLines: Boolean(nextSettings.removeBlankLines),
    trimLeadingSpaces: Boolean(nextSettings.trimLeadingSpaces),
    shortcut: normalizeShortcut(nextSettings.shortcut),
    windowSize: WINDOW_SIZES[nextSettings.windowSize] ? nextSettings.windowSize : DEFAULT_SETTINGS.windowSize
  };
  await writeSettings();
  const registered = registerShortcuts();
  if (!registered) {
    settings.shortcut = previousSettings.shortcut || DEFAULT_SETTINGS.shortcut;
    await writeSettings();
    registerShortcuts();
  }
  applyWindowSize();
  return settings;
});

ipcMain.handle('entries:update', async (_event, nextEntry) => {
  const index = entries.findIndex((entry) => entry.id === nextEntry.id);
  if (index === -1) return null;

  const current = entries[index];
  const text = current.contentType === 'Text' ? normalizeText(nextEntry.text) : current.text || '';
  entries[index] = {
    ...current,
    text,
    title: current.contentType === 'Text' ? titleFromText(text) : current.title,
    tags: Array.isArray(nextEntry.tags) ? nextEntry.tags : entries[index].tags,
    pinned: typeof nextEntry.pinned === 'boolean' ? nextEntry.pinned : Boolean(current.pinned),
    updatedAt: nowIso()
  };

  await writeStore();
  emitEntriesChanged();
  return toRendererEntry(entries[index]);
});

ipcMain.handle('entries:delete', async (_event, id) => {
  const entry = entries.find((item) => item.id === id);
  entries = entries.filter((entry) => entry.id !== id);
  await writeStore();
  if (entry?.contentType === 'Image' && entry.imagePath) {
    fs.unlink(entry.imagePath).catch(() => {});
  }
  emitEntriesChanged();
  return toRendererEntries();
});

ipcMain.handle('entries:paste', async (_event, id) => {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return { ok: false, pasted: false };

  if (entry.contentType === 'Image') {
    const image = nativeImage.createFromPath(entry.imagePath);
    if (image.isEmpty()) return { ok: false, pasted: false };
    clipboard.writeImage(image);
    lastClipboardImageHash = entry.imageHash;
  } else {
    clipboard.writeText(entry.text);
    lastClipboardText = entry.text;
  }
  mainWindow?.hide();

  setTimeout(() => {
    pasteWithAppleScript(previousFrontmostAppId).catch((error) => console.error('Paste failed:', error));
  }, 160);

  return { ok: true, pasted: process.platform === 'darwin' };
});

ipcMain.handle('entries:copy', async (_event, id) => {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return false;
  if (entry.contentType === 'Image') {
    const image = nativeImage.createFromPath(entry.imagePath);
    if (image.isEmpty()) return false;
    clipboard.writeImage(image);
    lastClipboardImageHash = entry.imageHash;
    return true;
  }
  clipboard.writeText(entry.text);
  lastClipboardText = entry.text;
  return true;
});

ipcMain.handle('window:hide', () => {
  mainWindow?.hide();
});

ipcMain.handle('app:quit', () => {
  quitApp();
});
