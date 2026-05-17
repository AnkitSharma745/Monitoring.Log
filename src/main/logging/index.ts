import { loggerManager } from './manager';
import type { LoggerRegistryConfig } from './types';
import type { Logger } from 'winston';

export const initializeLoggers = (config: LoggerRegistryConfig): void => {
  loggerManager.initialize(config);
};

export const dailyLogger = (fileName: string): Logger => {
  const base = loggerManager.getRawLogger('appLogger');
  return base.child({ fileName });
};

export const jsonLogger = (fileName: string): Logger => {
  const base = loggerManager.getRawLogger('jsonLogger');
  return base.child({ fileName });
};
//this is barrel (single-point-of-entry) pattern to export all the types from the types.ts file after this whatever changes we made in types.ts file that will reflect in the index.ts file  and all the export from the types.ts file will be available in the index.ts file
export * from './types';
