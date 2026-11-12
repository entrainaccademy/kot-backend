import { Types } from "mongoose";
import { SuperAdmin, ISuperAdmin } from "../models/SuperAdmin";
import { Staff, IStaff } from "../models/Staff";
import { Restaurant } from "../models/Restaurant";
import { RefreshToken } from "../models/RefreshToken";
import { comparePassword, hashPassword } from "../utils/password";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateTokenFamily,
  REFRESH_TOKEN_EXPIRY_DAYS,
  AuthUserPayload,
} from "../utils/jwt";
import { logSecurityEvent } from "./auditService";
import { DEFAULT_ROLE_PERMISSIONS } from "../utils/permissions";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    userType: "SuperAdmin" | "Staff";
    restaurantId?: string;
    restaurantName?: string;
    permissions: string[];
  };
}

export const login = async (
  emailInput: string,
  passwordInput: string,
  ipAddress?: string,
  userAgent?: string
): Promise<LoginResult> => {
  const normalizedEmail = emailInput.trim().toLowerCase();

  // 1. Check SuperAdmin accounts
  let superAdmin = await SuperAdmin.findOne({ email: normalizedEmail }).select(
    "+passwordHash"
  );
  let staff: IStaff | null = null;
  let userType: "SuperAdmin" | "Staff" = "SuperAdmin";

  if (!superAdmin) {
    // 2. Check Staff accounts
    staff = await Staff.findOne({ email: normalizedEmail }).select("+passwordHash");
    userType = "Staff";
  }

  // Generic error to prevent account enumeration
  const invalidCredentialsError = new Error("Invalid email or password");

  if (!superAdmin && !staff) {
    await logSecurityEvent({
      actorId: new Types.ObjectId(),
      action: "AUTH_LOGIN_FAILED",
      entityType: "Unknown",
      metadata: { email: normalizedEmail, reason: "User not found", ipAddress, userAgent },
    });
    throw invalidCredentialsError;
  }

  const userDoc = superAdmin || staff!;
  const isValidPassword = await comparePassword(passwordInput, userDoc.passwordHash);

  if (!isValidPassword) {
    await logSecurityEvent({
      actorId: userDoc._id as Types.ObjectId,
      action: "AUTH_LOGIN_FAILED",
      entityType: userType,
      entityId: userDoc._id as Types.ObjectId,
      restaurantId: staff ? staff.restaurantId : undefined,
      metadata: { email: normalizedEmail, reason: "Incorrect password", ipAddress, userAgent },
    });
    throw invalidCredentialsError;
  }

  // Verify account is active
  if (userDoc.status !== "ACTIVE") {
    throw new Error("Your account has been deactivated. Please contact support.");
  }

  let restaurantName: string | undefined;

  // If staff, verify restaurant status
  if (staff) {
    const restaurant = await Restaurant.findById(staff.restaurantId);
    if (!restaurant) {
      throw new Error("Associated restaurant not found.");
    }
    if (restaurant.status !== "ACTIVE") {
      throw new Error(`Restaurant is currently ${restaurant.status.toLowerCase()}. Access denied.`);
    }
    restaurantName = restaurant.name;
  }

  // Derive permissions
  const effectivePermissions = staff
    ? Array.from(
        new Set([
          ...(DEFAULT_ROLE_PERMISSIONS[staff.role] || []),
          ...(staff.permissions || []),
        ])
      )
    : DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;

  const authUserPayload: AuthUserPayload = {
    id: userDoc._id.toString(),
    email: userDoc.email,
    role: userDoc.role,
    userType,
    restaurantId: staff ? staff.restaurantId.toString() : undefined,
    permissions: effectivePermissions,
  };

  // Generate tokens with Token Family for rotation security
  const family = generateTokenFamily();
  const accessToken = generateAccessToken(authUserPayload);
  const refreshToken = generateRefreshToken({
    userId: userDoc._id.toString(),
    userType,
    family,
  });

  // Calculate refresh token expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Store hashed refresh token in MongoDB
  await RefreshToken.create({
    userId: userDoc._id,
    userType,
    restaurantId: staff ? staff.restaurantId : undefined,
    tokenHash: hashToken(refreshToken),
    family,
    isRevoked: false,
    expiresAt,
    ipAddress,
    userAgent,
  });

  // Update last login
  if (superAdmin) {
    await SuperAdmin.findByIdAndUpdate(superAdmin._id, { lastLogin: new Date() });
  }

  await logSecurityEvent({
    actorId: userDoc._id as Types.ObjectId,
    action: "AUTH_LOGIN_SUCCESS",
    entityType: userType,
    entityId: userDoc._id as Types.ObjectId,
    restaurantId: staff ? staff.restaurantId : undefined,
    metadata: { email: normalizedEmail, ipAddress, userAgent },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: userDoc._id.toString(),
      name: userDoc.name,
      email: userDoc.email,
      role: userDoc.role,
      userType,
      restaurantId: staff ? staff.restaurantId.toString() : undefined,
      restaurantName,
      permissions: effectivePermissions,
    },
  };
};

export const rotateRefreshToken = async (
  currentRefreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ accessToken: string; newRefreshToken: string }> => {
  let decoded;
  try {
    decoded = verifyRefreshToken(currentRefreshToken);
  } catch (error) {
    throw new Error("Invalid or expired refresh token.");
  }

  const currentHash = hashToken(currentRefreshToken);
  const tokenRecord = await RefreshToken.findOne({
    family: decoded.family,
    tokenHash: currentHash,
  });

  // Reuse Detection: If the token is not found or is already revoked, an attacker may have reused it
  if (!tokenRecord || tokenRecord.isRevoked) {
    // Revoke all tokens belonging to this family to invalidate all sessions for safety
    await RefreshToken.updateMany(
      { family: decoded.family },
      { isRevoked: true }
    );

    await logSecurityEvent({
      actorId: new Types.ObjectId(decoded.userId),
      action: "AUTH_TOKEN_REUSE_DETECTED",
      entityType: decoded.userType,
      metadata: { family: decoded.family, ipAddress, userAgent },
    });

    throw new Error("Suspicious session activity detected. All active sessions have been revoked. Please log in again.");
  }

  // Check expiration
  if (tokenRecord.expiresAt < new Date()) {
    tokenRecord.isRevoked = true;
    await tokenRecord.save();
    throw new Error("Refresh token expired. Please log in again.");
  }

  // Mark current token as revoked (used)
  tokenRecord.isRevoked = true;
  await tokenRecord.save();

  // Retrieve user to construct fresh access payload
  let userDoc: ISuperAdmin | IStaff | null = null;
  let restaurantId: string | undefined;

  if (decoded.userType === "SuperAdmin") {
    userDoc = await SuperAdmin.findById(decoded.userId);
  } else {
    userDoc = await Staff.findById(decoded.userId);
    if (userDoc) {
      restaurantId = (userDoc as IStaff).restaurantId.toString();
    }
  }

  if (!userDoc || userDoc.status !== "ACTIVE") {
    throw new Error("User account is inactive or no longer exists.");
  }

  const effectivePermissions = decoded.userType === "Staff"
    ? Array.from(
        new Set([
          ...(DEFAULT_ROLE_PERMISSIONS[userDoc.role] || []),
          ...((userDoc as IStaff).permissions || []),
        ])
      )
    : DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;

  const authUserPayload: AuthUserPayload = {
    id: userDoc._id.toString(),
    email: userDoc.email,
    role: userDoc.role,
    userType: decoded.userType,
    restaurantId,
    permissions: effectivePermissions,
  };

  // Generate new token pair in the same family
  const accessToken = generateAccessToken(authUserPayload);
  const newRefreshToken = generateRefreshToken({
    userId: userDoc._id.toString(),
    userType: decoded.userType,
    family: decoded.family,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await RefreshToken.create({
    userId: userDoc._id,
    userType: decoded.userType,
    restaurantId: restaurantId ? new Types.ObjectId(restaurantId) : undefined,
    tokenHash: hashToken(newRefreshToken),
    family: decoded.family,
    isRevoked: false,
    expiresAt,
    ipAddress,
    userAgent,
  });

  await logSecurityEvent({
    actorId: userDoc._id as Types.ObjectId,
    action: "AUTH_TOKEN_ROTATED",
    entityType: decoded.userType,
    restaurantId,
    metadata: { family: decoded.family, ipAddress, userAgent },
  });

  return { accessToken, newRefreshToken };
};

export const logout = async (refreshTokenString?: string): Promise<void> => {
  if (!refreshTokenString) return;

  try {
    const tokenHash = hashToken(refreshTokenString);
    const session = await RefreshToken.findOne({ tokenHash });
    if (session) {
      session.isRevoked = true;
      await session.save();

      await logSecurityEvent({
        actorId: session.userId,
        action: "AUTH_LOGOUT",
        entityType: session.userType,
        restaurantId: session.restaurantId,
        metadata: { family: session.family },
      });
    }
  } catch (error) {
    // Ignore verification errors on logout
  }
};

export const changePassword = async (
  userId: string,
  userType: "SuperAdmin" | "Staff",
  currentPass: string,
  newPass: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> => {
  let userDoc =
    userType === "SuperAdmin"
      ? await SuperAdmin.findById(userId).select("+passwordHash")
      : await Staff.findById(userId).select("+passwordHash");

  if (!userDoc) {
    throw new Error("User account not found.");
  }

  const isValid = await comparePassword(currentPass, userDoc.passwordHash);
  if (!isValid) {
    await logSecurityEvent({
      actorId: userDoc._id as Types.ObjectId,
      action: "AUTH_PASSWORD_CHANGE_FAILED",
      entityType: userType,
      metadata: { reason: "Incorrect current password", ipAddress, userAgent },
    });
    throw new Error("Current password does not match.");
  }

  userDoc.passwordHash = await hashPassword(newPass);
  await userDoc.save();

  // Invalidate all active refresh token sessions to force re-authentication
  await RefreshToken.updateMany({ userId: new Types.ObjectId(userId) }, { isRevoked: true });

  await logSecurityEvent({
    actorId: userDoc._id as Types.ObjectId,
    action: "AUTH_PASSWORD_CHANGED",
    entityType: userType,
    metadata: { ipAddress, userAgent },
  });
};

export const getMe = async (
  userId: string,
  userType: "SuperAdmin" | "Staff"
) => {
  if (userType === "SuperAdmin") {
    const admin = await SuperAdmin.findById(userId);
    if (!admin) throw new Error("SuperAdmin not found.");
    return {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      userType: "SuperAdmin",
      status: admin.status,
      permissions: DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN,
    };
  } else {
    const staff = await Staff.findById(userId);
    if (!staff) throw new Error("Staff member not found.");
    const restaurant = await Restaurant.findById(staff.restaurantId);

    const permissions = Array.from(
      new Set([
        ...(DEFAULT_ROLE_PERMISSIONS[staff.role] || []),
        ...(staff.permissions || []),
      ])
    );

    return {
      id: staff._id.toString(),
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      userType: "Staff",
      status: staff.status,
      restaurantId: staff.restaurantId.toString(),
      restaurant: restaurant
        ? {
            id: restaurant._id.toString(),
            name: restaurant.name,
            slug: restaurant.slug,
            currency: restaurant.currency,
            status: restaurant.status,
          }
        : null,
      permissions,
    };
  }
};

