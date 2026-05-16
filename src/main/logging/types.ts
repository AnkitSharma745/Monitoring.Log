export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
  SILLY = 'silly',
}

export type LogLevelType = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

export type LogFormat = 'json' | 'pretty';

export interface TransportLogConfig {
  logFilePath: string;
  format: LogFormat;
  level?: LogLevelType;
  enableConsole?: boolean;
}

export interface LoggerRegistryConfig {
  appLogger?: TransportLogConfig;
  jsonLogger?: TransportLogConfig;
}

export type LoggerName = keyof LoggerRegistryConfig;
