import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { initializeLoggers, dailyLogger } from './logging';
import { LOGS_BASE_DIR } from './utils/constants';

const COMPONENT_NAME = 'MainProcess';

initializeLoggers({
  appLogger: {
    logFilePath: join(LOGS_BASE_DIR, 'app'),
    format: 'pretty',
    level: 'info',
  },
  jsonLogger: {
    logFilePath: join(LOGS_BASE_DIR, 'json/app-json'),
    format: 'json',
    level: 'info',
  },
});

const log = dailyLogger('main.ts');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      log.info('Application started successfully.', { component: COMPONENT_NAME });
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.info('Another instance detected. Quitting this instance.', { component: COMPONENT_NAME });
  app.quit();
} else {
  app.on('second-instance', () => {
    log.info('Second instance detected; focusing existing window.', { component: COMPONENT_NAME });
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app
    .whenReady()
    .then(() => {
      electronApp.setAppUserModelId('monitoring-log');
      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window);
      });

      ipcMain.on('log-message', (_event, { level, message, fileName, data }) => {
        const logger = dailyLogger(fileName || 'renderer.ts');
        logger.log(level, message, { data });
      });

      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error) => {
      log.error('Failed to initialize application.', error);
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
