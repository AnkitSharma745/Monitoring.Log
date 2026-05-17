export interface IpcError {
  code: string;
  message: string;
}

export type IpcResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: IpcError;
    };
