import type { IpcResponse } from '@shared/contracts/ipc';

export const unwrapIpcResponse = <T>(response: IpcResponse<T>): T => {
  if (response.ok) {
    return response.data;
  }

  throw new Error(response.error.message);
};
