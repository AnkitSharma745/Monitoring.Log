import type { IpcResponse } from '@shared/contracts/ipc';

export class IpcValidationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

export const ipcSuccess = <T>(data: T): IpcResponse<T> => {
  return {
    ok: true,
    data,
  };
};

export const ipcFailure = <T>(code: string, message: string): IpcResponse<T> => {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
};

export const toIpcFailure = <T>(error: unknown): IpcResponse<T> => {
  if (error instanceof IpcValidationError) {
    return ipcFailure(error.code, error.message);
  }

  return ipcFailure('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected error.');
};
