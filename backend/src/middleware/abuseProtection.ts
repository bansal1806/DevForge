import { Request, Response, NextFunction } from 'express';

/**
 * Basic User-Agent filtering to block common bots and scrapers.
 * Note: Easily spoofed, but stops low-effort automated scripts.
 */
export const blockBots = (req: Request, res: Response, next: NextFunction) => {
  const ua = req.get('User-Agent') || '';
  
  const botPatterns = [
    /curl/i,
    /python-requests/i,
    /postman/i,
    /insomnia/i,
    /headless/i,
    /puppeteer/i,
    /selenium/i,
    /wget/i,
    /gobuster/i,
    /dirb/i,
    /nmap/i
  ];

  const isBot = botPatterns.some(pattern => pattern.test(ua));

  if (isBot) {
    console.warn(`[Abuse Protection] Blocked request from bot-like User-Agent: ${ua}`);
    return res.status(403).json({ 
      error: 'Access denied: Automated scripts are not permitted to access this endpoint.' 
    });
  }

  next();
};

/**
 * Ensures POST/PUT payloads do not exceed a reasonable size.
 * Prevents DoS attacks using massive JSON payloads.
 */
export const limitPayloadSize = (maxBytes: number = 1024 * 1024) => { // Default 1MB
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (contentLength > maxBytes) {
      return res.status(413).json({ 
        error: `Payload too large. Maximum permitted size is ${maxBytes / 1024}KB.` 
      });
    }
    
    next();
  };
};
