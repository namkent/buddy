import { Request, Response, NextFunction } from 'express';

const logger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalEnd = res.end;

  res.end = function (chunk?: any, encoding?: any, callback?: any): Response {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? "\x1b[31m" : "\x1b[32m";
    console.log(
      `\x1b[32m[AI-SERVICE]\x1b[0m ${statusColor}${res.statusCode}\x1b[0m ${req.method} ${req.path} - ${duration}ms`
    );
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
};

export default logger;
