import { app, BrowserWindow, nativeTheme } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let serverProcess = null;
let serverUrl = 'http://localhost:5174/';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function startServer() {
  const cwd = path.resolve(__dirname, '..');
  const env = { ...process.env, PORT: '5174' };
  serverProcess = spawn(process.execPath, ['server.js'], { cwd, env });
  serverProcess.stdout.on('data', (buf) => {
    const s = buf.toString();
    if (s.includes('http://localhost')) {
      serverUrl = (s.match(/http:\/\/localhost:\d+/) || [serverUrl])[0] + '/';
      if (BrowserWindow.getAllWindows().length) {
        BrowserWindow.getAllWindows()[0].loadURL(serverUrl).catch(() => {});
      }
    }
  });
  serverProcess.stderr.on('data', () => {});
  serverProcess.on('exit', () => { serverProcess = null; });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0f14' : '#f5f7fb',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
  });
  win.loadURL(serverUrl).catch(() => {});
}

app.whenReady().then(() => {
  startServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverProcess) {
    try { serverProcess.kill('SIGTERM'); } catch {}
  }
});