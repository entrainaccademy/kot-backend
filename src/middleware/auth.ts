import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AuthUserPayload } from "../utils/jwt";
import { SuperAdmin } from "../models/SuperAdmin";
import { Staff } from "../models/Staff";
import { Restaurant } from "../models/Restaurant";
import { Permission, DEFAULT_ROLE_PERMISSIONS } from "../utils/permissions";

/**
 * Verifies JWT Access Token and validates user account status.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please provide a valid Bearer token.",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Invalid authorization header format.",
      });
      return;
    }

    let payload: AuthUserPayload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      res.status(401).json({
        success: false,
        message: "Access token is invalid or has expired.",
      });
      return;
    }

    // Verify account exists and is active in database
    if (payload.userType === "SuperAdmin") {
      const superAdmin = await SuperAdmin.findById(payload.id);
      if (!superAdmin || superAdmin.status !== "ACTIVE") {
        res.status(401).json({
          success: false,
          message: "Account not found or has been deactivated.",
        });
        return;
      }
    } else if (payload.userType === "Staff") {
      const staff = await Staff.findById(payload.id);
      if (!staff || staff.status !== "ACTIVE") {
        res.status(401).json({
          success: false,
          message: "Account not found or has been deactivated.",
        });
        return;
      }

      // Verify that restaurantId in token matches staff database record
      if (staff.restaurantId.toString() !== payload.restaurantId) {
        res.status(403).json({
          success: false,
          message: "Tenant context mismatch.",
        });
        return;
      }
    } else {
      res.status(401).json({
        success: false,
        message: "Unrecognized user type.",
      });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Enforces role-based access control.
 */
export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user.role}' is not authorized to access this resource.`,
      });
      return;
    }

    next();
  };
};

/**
 * Enforces granular permission checking.
 * SuperAdmin and Restaurant Admin bypass with full permissions.
 */
export const requirePermission = (...requiredPermissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    // Platform Super Admin and Restaurant Admin have unrestricted access within their domain
    if (req.user.role === "SUPER_ADMIN" || req.user.role === "ADMIN") {
      next();
      return;
    }

    // Combine explicit permissions with role default permissions
    const effectivePermissions = new Set<string>([
      ...(DEFAULT_ROLE_PERMISSIONS[req.user.role] || []),
      ...(req.user.permissions || []),
    ]);

    const hasAll = requiredPermissions.every((p) => effectivePermissions.has(p));
    if (!hasAll) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You do not possess the required permissions.",
        required: requiredPermissions,
      });
      return;
    }

    next();
  };
};

/**
 * Enforces restaurant tenant access and validates active restaurant status.
 */
export const requireRestaurantAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
      return;
    }

    // SuperAdmin has platform-wide authority
    if (req.user.role === "SUPER_ADMIN") {
      next();
      return;
    }

    if (!req.user.restaurantId) {
      res.status(403).json({
        success: false,
        message: "Access denied: User is not associated with any restaurant.",
      });
      return;
    }

    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      res.status(404).json({
        success: false,
        message: "Restaurant not found.",
      });
      return;
    }

    if (restaurant.status !== "ACTIVE") {
      res.status(403).json({
        success: false,
        message: `Access denied: Restaurant is currently ${restaurant.status.toLowerCase()}.`,
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};

