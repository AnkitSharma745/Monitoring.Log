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

export const createEngineWorkerClient = (): EngineWorkerClient => {
  // Spawn the web worker using standard Vite syntax for assets/workers
  const worker = new Worker(new URL('../../workers/engineWorker.ts', import.meta.url), {
    type: 'module',
  });

  const pendingRequests = new Map<
    string,
    {
      resolve: (value: EngineWorkerResponse) => void;
      reject: (reason: any) => void;
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
  };

  return {
    request: (request: EngineWorkerRequest): Promise<EngineWorkerResponse> => {
      return new Promise<EngineWorkerResponse>((resolve, reject) => {
        pendingRequests.set(request.requestId, { resolve, reject });
        worker.postMessage(request);
      });
    },
    terminate: () => {
      worker.terminate();
      pendingRequests.clear();
    },
  };
};

let sharedWorkerClient: EngineWorkerClient | null = null;

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
