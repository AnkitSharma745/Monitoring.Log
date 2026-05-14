import type {
  SystemPingRequest,
  SystemPingResponse,
  SystemConfigResponse,
  RuntimeDiagnosticMetric,
  IpcResponse,
  LogSourceMetadata,
  IngestionDataChunk,
} from '../shared/contracts/ipc';

declare global {
  interface Window {
    desktop: {
      system: {
        ping: (req: SystemPingRequest) => Promise<IpcResponse<SystemPingResponse>>;
        getConfig: () => Promise<IpcResponse<SystemConfigResponse>>;
      };
      diagnostics: {
        getMetrics: () => Promise<IpcResponse<RuntimeDiagnosticMetric>>;
      };
      ingestion: {
        registerSource: (
          path: string,
          type: 'file' | 'directory' | 'stream',
        ) => Promise<IpcResponse<LogSourceMetadata>>;
        removeSource: (id: string) => Promise<IpcResponse<void>>;
        getSources: () => Promise<IpcResponse<LogSourceMetadata[]>>;
        onDataChunk: (callback: (chunk: IngestionDataChunk) => void) => () => void;
        onSourceAdded: (callback: (source: LogSourceMetadata) => void) => () => void;
      };
    };
  }
}

export {};
