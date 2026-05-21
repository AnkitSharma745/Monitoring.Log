import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    // entry point of main process By default, electron-vite searches for standard main-process filenames such as src/main/main.ts or src/main/index.ts to automatically set up the bundle entry points. but we are using mainProcess.ts as entry point for our main process.
    build: {
      lib: {
        entry: 'src/main/mainProcess.ts',
      },
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@core': resolve(__dirname, 'src/core'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@preload': resolve(__dirname, 'src/preload'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@core': resolve(__dirname, 'src/core'),
        '@workers': resolve(__dirname, 'src/workers'),
      },
    },
    plugins: [react()],
  },
});
