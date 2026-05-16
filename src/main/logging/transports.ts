import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { jsonFormatter, prettyFormatter } from './formatters';
import type { TransportLogConfig, LogFormat } from './types';

export const createFormat = (type: LogFormat): winston.Logform.Format => {
  return type === 'json' ? jsonFormatter : prettyFormatter;
};

export const createRotateFileTransport = (config: TransportLogConfig): winston.transport => {
  return new DailyRotateFile({
    filename: `${config.logFilePath}-%DATE%.log`,
    auditFile: `${config.logFilePath}-audit.json`,
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: createFormat(config.format),
    level: config.level || 'info',
  });
};

export const createConsoleTransport = (config: TransportLogConfig): winston.transport => {
  return new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      createFormat(config.format === 'json' ? 'json' : 'pretty'),
    ),
    level: config.level || 'info',
  });
};
