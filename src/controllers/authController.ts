import { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService";
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } from "../utils/cookie";

export const loginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const result = await authService.login(email, password, ipAddress, userAgent);

    // Set refresh token in HttpOnly secure cookie
    setRefreshCookie(res, result.refreshToken);

    res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    const statusCode = message === "Invalid email or password" ? 401 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const refreshHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Refresh token is missing. Please log in.",
      });
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const { accessToken, newRefreshToken } = await authService.rotateRefreshToken(
      token,
      ipAddress,
      userAgent
    );

    // Rotate refresh token cookie
    setRefreshCookie(res, newRefreshToken);

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken,
    });
  } catch (error) {
    clearRefreshCookie(res);
    const message = error instanceof Error ? error.message : "Failed to refresh token";
    res.status(401).json({
      success: false,
      message,
    });
  }
};

export const logoutHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    await authService.logout(token);
    clearRefreshCookie(res);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
};

export const getMeHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const user = await authService.getMe(req.user.id, req.user.userType);
    res.status(200).json({
      success: true,
      data: user,
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const changePasswordHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await authService.changePassword(
      req.user.id,
      req.user.userType,
      currentPassword,
      newPassword,
      ipAddress,
      userAgent
    );

    clearRefreshCookie(res);

    res.status(200).json({
      success: true,
      message: "Password changed successfully. Please log in again.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password change failed";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

