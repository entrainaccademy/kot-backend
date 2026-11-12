import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  let userMessage = err.message || "Internal Server Error";

  // Provide a clean, helpful explanation when MongoDB Atlas drops SSL handshake due to unwhitelisted IP
  if (
    userMessage.includes("SSL routines") ||
    userMessage.includes("tlsv1 alert internal error") ||
    userMessage.includes("SSL alert number 80")
  ) {
    userMessage =
      "MongoDB Atlas connection rejected (SSL alert 80). Your public IP address has changed. Please add your current IP address (or 0.0.0.0/0) in MongoDB Atlas -> Security -> Network Access.";
  }

  console.error(`[Error] ${req.method} ${req.url}:`, userMessage);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: userMessage,
    ...(isProduction ? {} : { stack: err.stack }),
  });
};

