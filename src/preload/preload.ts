import { contextBridge, ipcRenderer } from 'electron';
import { IpcInvokeChannels, IpcEventChannels } from '../shared/contracts/ipc';
import type {
  SystemPingRequest,
  SystemPingResponse,
  SystemConfigResponse,
  RuntimeDiagnosticMetric,
  IpcResponse,
  LogSourceMetadata,
  IngestionDataChunk,
} from '../shared/contracts/ipc';

/**
 * Highly Hardened Preload Context Isolation Bridge.
 * Binds explicit functional operations under the window.desktop namespace securely.
 */
const desktop = {
  system: {
    ping: async (req: SystemPingRequest): Promise<IpcResponse<SystemPingResponse>> => {
      try {
        return await ipcRenderer.invoke(IpcInvokeChannels.SYSTEM_PING, req);
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'IPC_INVOCATION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown invocation failure',
          },
        };
      }
    },
    getConfig: async (): Promise<IpcResponse<SystemConfigResponse>> => {
      try {
        return await ipcRenderer.invoke(IpcInvokeChannels.SYSTEM_GET_CONFIG);
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'IPC_INVOCATION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown invocation failure',
          },
        };
      }
    },
  },
  diagnostics: {
    getMetrics: async (): Promise<IpcResponse<RuntimeDiagnosticMetric>> => {
      try {
        return await ipcRenderer.invoke(IpcInvokeChannels.DIAGNOSTICS_GET_METRICS);
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'IPC_INVOCATION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown invocation failure',
          },
        };
      }
    },
  },
  ingestion: {
    registerSource: async (
      path: string,
      type: 'file' | 'directory' | 'stream',
    ): Promise<IpcResponse<LogSourceMetadata>> => {
      try {
        return await ipcRenderer.invoke(IpcInvokeChannels.INGESTION_REGISTER_SOURCE, {
          path,
          type,
        });
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'IPC_INVOCATION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown invocation failure',
          },
        };
      }
    },
    removeSource: async (id: string): Promise<IpcResponse<void>> => {
      try {
        return await ipcRenderer.invoke(IpcInvokeChannels.INGESTION_REMOVE_SOURCE, { id });
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'IPC_INVOCATION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown invocation failure',
          },
        };
      }
    },
    getSources: async (): Promise<IpcResponse<LogSourceMetadata[]>> => {
      try {
        return await ipcRenderer.invoke(IpcInvokeChannels.INGESTION_GET_SOURCES);
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'IPC_INVOCATION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown invocation failure',
          },
        };
      }
    },
    onDataChunk: (callback: (chunk: IngestionDataChunk) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, chunk: IngestionDataChunk): void =>
        callback(chunk);
      ipcRenderer.on(IpcEventChannels.INGESTION_DATA_CHUNK, listener);
      return (): void => {
        ipcRenderer.removeListener(IpcEventChannels.INGESTION_DATA_CHUNK, listener);
      };
    },
    onSourceAdded: (callback: (source: LogSourceMetadata) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, source: LogSourceMetadata): void =>
        callback(source);
      ipcRenderer.on(IpcEventChannels.INGESTION_SOURCE_ADDED, listener);
      return (): void => {
        ipcRenderer.removeListener(IpcEventChannels.INGESTION_SOURCE_ADDED, listener);
      };
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('desktop', desktop);
  } catch (error) {
    console.warn('ContextBridge exposure failed during platform setup:', error);
  }
} else {
  throw new Error('CRITICAL SECURITY VIOLATION: Context Isolation MUST be enabled.');
}
