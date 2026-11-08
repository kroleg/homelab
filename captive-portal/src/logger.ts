import winston from 'winston';

export function createLogger(level: string) {
  return winston.createLogger({
    level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
  });
}
