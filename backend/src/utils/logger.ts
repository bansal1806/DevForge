import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Custom format for clean structured logs
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json()
);

// Create the logger instance
export const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
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
    // 3. Console (Real-time monitoring)
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
