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

export * from './types';
