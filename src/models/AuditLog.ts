import { Schema, model, Document, Types } from "mongoose";

export interface IAuditLog extends Document {
  restaurantId?: Types.ObjectId; // Optional for SuperAdmin operations
  actorId: Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      required: [true, "Actor ID is required"],
      index: true,
    },
    action: {
      type: String,
      required: [true, "Action is required"],
      trim: true,
      maxlength: 100,
    },
    entityType: {
      type: String,
      required: [true, "Entity type is required"],
      trim: true,
      maxlength: 100,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable audit records
  }
);

AuditLogSchema.index({ restaurantId: 1, createdAt: -1 });
AuditLogSchema.index({ restaurantId: 1, entityType: 1, entityId: 1 });

export const AuditLog = model<IAuditLog>("AuditLog", AuditLogSchema);

