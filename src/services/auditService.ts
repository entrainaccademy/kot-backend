import { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog";

export interface SecurityEventData {
  actorId: Types.ObjectId | string;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | string;
  restaurantId?: Types.ObjectId | string;
  metadata?: Record<string, any>;
}

export const logSecurityEvent = async (data: SecurityEventData): Promise<void> => {
  try {
    // Sanitize metadata to guarantee no passwords or tokens are stored
    const sanitizedMetadata = { ...data.metadata };
    delete sanitizedMetadata.password;
    delete sanitizedMetadata.passwordHash;
    delete sanitizedMetadata.token;
    delete sanitizedMetadata.refreshToken;
    delete sanitizedMetadata.currentPassword;
    delete sanitizedMetadata.newPassword;

    await AuditLog.create({
      actorId: new Types.ObjectId(data.actorId),
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId ? new Types.ObjectId(data.entityId) : undefined,
      restaurantId: data.restaurantId ? new Types.ObjectId(data.restaurantId) : undefined,
      metadata: sanitizedMetadata,
    });
  } catch (error) {
    // Never fail the main application request if an audit log write encounters an issue
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`Audit logging warning: Failed to record event '${data.action}': ${errMsg}`);
  }
};

