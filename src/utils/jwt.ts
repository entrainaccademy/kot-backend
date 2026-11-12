import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";

export interface AuthUserPayload {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "CASHIER" | "WAITER" | "KITCHEN_STAFF";
  userType: "SuperAdmin" | "Staff";
  restaurantId?: string;
  permissions: string[];
}

export interface RefreshTokenPayload {
  userId: string;
  userType: "SuperAdmin" | "Staff";
  family: string;
}

const getAccessSecret = (): string => {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET is not configured in environment variables.");
  }
  return secret;
};

const getRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is not configured in environment variables.");
  }
  return secret;
};

export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export const generateAccessToken = (payload: AuthUserPayload): string => {
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
  return jwt.sign(payload, getAccessSecret(), options);
};

export const generateRefreshToken = (payload: RefreshTokenPayload): string => {
  const options: SignOptions = {
    expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
  };
  return jwt.sign(payload, getRefreshSecret(), options);
};

export const verifyAccessToken = (token: string): AuthUserPayload => {
  return jwt.verify(token, getAccessSecret()) as AuthUserPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  return jwt.verify(token, getRefreshSecret()) as RefreshTokenPayload;
};

export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const generateTokenFamily = (): string => {
  return crypto.randomUUID();
};

