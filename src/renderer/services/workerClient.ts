import type { EngineWorkerRequest, EngineWorkerResponse } from '@workers/workerProtocol';

export interface EngineWorkerClient {
  request: (request: EngineWorkerRequest) => Promise<EngineWorkerResponse>;
  terminate?: () => void;
}

export const createUnavailableEngineWorkerClient = (): EngineWorkerClient => {
  return {
    request: async (request): Promise<EngineWorkerResponse> => ({
      type: 'error',
      requestId: request.requestId,
      message: 'Engine worker runtime is not wired yet.',
    }),
  };
};

let sharedWorkerClient: EngineWorkerClient | null = null;

export const createEngineWorkerClient = (): EngineWorkerClient => {
  // Spawn the web worker using standard Vite syntax for assets/workers
  const worker = new Worker(new URL('../../workers/engineWorker.ts', import.meta.url), {
    type: 'module',
  });

  const pendingRequests = new Map<
    string,
    {
      resolve: (value: EngineWorkerResponse) => void;
      reject: (reason: unknown) => void;
    }
  >();

  worker.onmessage = (event: MessageEvent<EngineWorkerResponse>) => {
    const response = event.data;
    const pending = pendingRequests.get(response.requestId);
    if (pending) {
      pendingRequests.delete(response.requestId);
      if (response.type === 'error') {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response);
      }
    }
  };

  worker.onerror = (error) => {
    console.error('Engine Web Worker error:', error);
    for (const [_, pending] of pendingRequests.entries()) {
      pending.reject(new Error('Engine Worker encountered an unhandled error.'));
    }
    pendingRequests.clear();
    // Nullify the shared reference so a fresh worker is spawned automatically on the next call
    sharedWorkerClient = null;
  };

  worker.onmessageerror = (error) => {
    console.error('Engine Web Worker message error:', error);
    sharedWorkerClient = null;
  };

  return {
    request: (request: EngineWorkerRequest): Promise<EngineWorkerResponse> => {
      return new Promise<EngineWorkerResponse>((resolve, reject) => {
        // Build 15 seconds timeout to protect UI thread responsiveness
        const timeoutId = setTimeout(() => {
          if (pendingRequests.has(request.requestId)) {
            pendingRequests.delete(request.requestId);
            reject(new Error(`Worker request timed out after 15000ms: type=${request.type}`));
          }
        }, 15000);

        pendingRequests.set(request.requestId, {
          resolve: (val) => {
            clearTimeout(timeoutId);
            resolve(val);
          },
          reject: (err) => {
            clearTimeout(timeoutId);
            reject(err);
          },
        });
        worker.postMessage(request);
      });
    },
    terminate: () => {
      try {
        worker.terminate();
      } catch {
        // ignore
      }
      pendingRequests.clear();
      sharedWorkerClient = null;
    },
  };
};

export const getEngineWorkerClient = (): EngineWorkerClient => {
  if (!sharedWorkerClient) {
    try {
      sharedWorkerClient = createEngineWorkerClient();
    } catch (e) {
      console.error('Failed to spawn Engine Worker, falling back to unavailable client:', e);
      sharedWorkerClient = createUnavailableEngineWorkerClient();
    }
  }
  return sharedWorkerClient;
};
