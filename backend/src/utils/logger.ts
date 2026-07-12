import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Serverless filesystems (Vercel/AWS Lambda) are read-only outside /tmp — file
// transports would crash at module load, so only use them on long-running hosts.
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const logDir = 'logs';
if (!isServerless && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Custom format for clean structured logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

const fileTransports = isServerless ? [] : [
  // 1. Error logs (Persistent)
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error'
  }),
  // 2. Auth logs (Audit trail)
  new winston.transports.File({
    filename: path.join(logDir, 'auth.log'),
    level: 'info',
    format: winston.format.combine(
      winston.format.label({ label: 'AUTH' }),
      logFormat
    )
  }),
];

// Create the logger instance
export const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    ...fileTransports,
    // Console (Real-time monitoring; the only transport on serverless)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * Specifically for logging authentication attempts.
 */
export const logAuth = (email: string, status: 'success' | 'failure', details?: string) => {
  logger.info({
    label: 'AUTH',
    email,
    status,
    details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Specifically for logging rate-limit blocks.
 */
export const logAbuse = (ip: string, endpoint: string, message: string) => {
  logger.warn({
    label: 'ABUSE',
    ip,
    endpoint,
    message,
    timestamp: new Date().toISOString()
  });
};
