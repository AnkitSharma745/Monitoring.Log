import winston from 'winston';
import { createRotateFileTransport, createConsoleTransport } from './transports';
import type { LoggerRegistryConfig, LoggerName, TransportLogConfig } from './types';
import type { Logger } from 'winston';

class LoggerManager {
  private static instance: LoggerManager;
  private loggers = new Map<string, Logger>();
  private initialized = false;

  private constructor() {
    //
  }

  public static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager();
    }
    return LoggerManager.instance;
  }

  public initialize(configRegistry: LoggerRegistryConfig): void {
    if (this.initialized) return;

    for (const [key, config] of Object.entries(configRegistry)) {
      if (config) {
        this.createBaseLogger(key as LoggerName, config);
      }
    }

    this.initialized = true;
  }

  private createBaseLogger(name: LoggerName, config: TransportLogConfig): void {
    const transports: winston.transport[] = [createRotateFileTransport(config)];

    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    const shouldLogConsole = config.enableConsole ?? isDev;

    if (shouldLogConsole) {
      transports.push(createConsoleTransport(config));
    }

    const logger = winston.createLogger({
      level: config.level || 'info',
      transports,
      exitOnError: false,
    });

    this.loggers.set(name, logger);
  }

  public getRawLogger(name: LoggerName): Logger {
    const logger = this.loggers.get(name);
    if (!logger) {
      return winston.createLogger({
        transports: [new winston.transports.Console()],
      });
    }
    return logger;
  }
}

export const loggerManager = LoggerManager.getInstance();
