import winston from 'winston';

export function createLogger(level: string) {
  return winston.createLogger({
    level,
    format: winston.format.json(),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
    ],
  });
}

export type Logger = ReturnType<typeof createLogger>;
