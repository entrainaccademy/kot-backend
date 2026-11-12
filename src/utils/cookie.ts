import { CookieOptions, Response } from "express";

export const REFRESH_COOKIE_NAME = "refreshToken";

export const getRefreshCookieOptions = (): CookieOptions => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  };
};

export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(REFRESH_COOKIE_NAME, token, getRefreshCookieOptions());
};

export const clearRefreshCookie = (res: Response): void => {
  const { maxAge, ...clearOptions } = getRefreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOptions);
};

