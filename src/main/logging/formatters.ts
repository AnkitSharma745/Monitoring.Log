import dayjs from 'dayjs';
import { serializeError } from 'serialize-error';
import winston from 'winston';

const { format } = winston;

const errorSerializer = format((info) => {
  if (info.error instanceof Error) {
    info.error = serializeError(info.error);
  }
  if (info.data instanceof Error) {
    info.data = serializeError(info.data);
  }
  if (info instanceof Error) {
    return Object.assign({}, info, serializeError(info));
  }
  return info;
});

export const prettyFormatter = format.combine(
  errorSerializer(),
  format.timestamp({ format: () => dayjs().format('hh:mm:ss.SSS A') }),
  format.printf((info) => {
    const { timestamp, level, message, fileName, data, error, ...meta } = info;
    const levelUpper = level.toUpperCase();
    const context = fileName ? `${fileName}` : '';
    let logStr = `${timestamp} [${levelUpper}] : ${context}`;

    logStr += ` Message: ${message}`;

    if (error) {
      logStr += ` | Error: ${JSON.stringify(error)}`;
    } else if (data) {
      logStr += ` | Data: ${JSON.stringify(data)}`;
    } else {
      const cleanMeta = Object.fromEntries(
        Object.entries(meta).filter(
          ([key]) => typeof key === 'string' && !key.startsWith('Symbol'),
        ),
      );
      if (Object.keys(cleanMeta).length > 0) {
        logStr += ` | Data: ${JSON.stringify(cleanMeta)}`;
      }
    }

    return logStr;
  }),
);

export const jsonFormatter = format.combine(
  errorSerializer(),
  format.timestamp(),
  format.printf((info) => {
    const { timestamp, level, message, fileName, data, error, ...rest } = info;

    const cleanRest = Object.fromEntries(
      Object.entries(rest).filter(([key]) => typeof key === 'string' && !key.startsWith('Symbol')),
    );

    const jsonOutput = {
      timestamp,
      level,
      fileName: fileName || '',
      message,
      data: data || null,
      error: error || null,
      ...cleanRest,
    };

    return JSON.stringify(jsonOutput);
  }),
);
