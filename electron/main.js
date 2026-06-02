const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const isDev = !app.isPackaged;

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await win.loadURL('http://localhost:5173');
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('save-project', async (_e, jsonString) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Сохранить проект',
    filters: [{ name: 'Bot project', extensions: ['json'] }],
    defaultPath: 'bot.json',
  });
  if (canceled || !filePath) return { ok: false };
  await fs.writeFile(filePath, jsonString, 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('open-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Открыть проект',
    filters: [{ name: 'Bot project', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return { ok: false };
  const data = await fs.readFile(filePaths[0], 'utf8');
  return { ok: true, data, filePath: filePaths[0] };
});

ipcMain.handle('save-bot', async (_e, jsString) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Сохранить bot.js',
    filters: [{ name: 'JavaScript', extensions: ['js'] }],
    defaultPath: 'bot.js',
  });
  if (canceled || !filePath) return { ok: false };
  await fs.writeFile(filePath, jsString, 'utf8');
  return { ok: true, filePath };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
