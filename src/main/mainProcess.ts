import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { APP_IPC_CHANNELS } from '@shared/ipc/appChannels';
import { FILE_IPC_CHANNELS } from '@shared/ipc/fileChannels';
import { DirectoryScanner } from './filesystem/directoryScanner';
import { FileDialogService } from './filesystem/fileDialogService';
import { FileReaderService } from './filesystem/fileReader';
import { PathScanner } from './filesystem/pathScanner';
import { registerFileSourceIpcHandlers } from './ipc/fileSourceHandlers';
import { initializeLoggers, dailyLogger } from './logging';
import { LOGS_BASE_DIR } from './utils/constants';
import { FileWatcherService } from './watchers/fileWatcherService';

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

const directoryScanner = new DirectoryScanner(dailyLogger('directory-scanner.ts'));
const fileReader = new FileReaderService(dailyLogger('file-reader.ts'));
const pathScanner = new PathScanner(directoryScanner, dailyLogger('path-scanner.ts'));
const fileWatcher = new FileWatcherService(
  fileReader,
  dailyLogger('file-watcher.ts'),
  (event) => {
    mainWindow?.webContents.send(FILE_IPC_CHANNELS.fileUpdated, event);
  },
  (event) => {
    mainWindow?.webContents.send(FILE_IPC_CHANNELS.watchError, event);
  },
);
const fileDialogs = new FileDialogService(directoryScanner, dailyLogger('file-dialogs.ts'));

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

  mainWindow.on('closed', () => {
    void fileWatcher.stopAll();
    mainWindow = null;
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

      ipcMain.handle(APP_IPC_CHANNELS.reloadWindow, (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        log.info('Renderer requested window reload.', { component: COMPONENT_NAME });

        setTimeout(() => {
          window?.reload();
        }, 50);

        return undefined;
      });

      registerFileSourceIpcHandlers(
        {
          dialogs: fileDialogs,
          directoryScanner,
          pathScanner,
          reader: fileReader,
          watcher: fileWatcher,
        },
        dailyLogger('file-source-ipc.ts'),
      );

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

app.on('before-quit', () => {
  void fileWatcher.stopAll();
});
