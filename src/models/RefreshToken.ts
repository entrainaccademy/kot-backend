import { Schema, model, Document, Types } from "mongoose";

export interface IRefreshToken extends Document {
  userId: Types.ObjectId;
  userType: "SuperAdmin" | "Staff";
  restaurantId?: Types.ObjectId;
  tokenHash: string;
  family: string;
  isRevoked: boolean;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: [true, "User ID is required"],
      index: true,
    },
    userType: {
      type: String,
      enum: ["SuperAdmin", "Staff"],
      required: [true, "User type is required"],
    },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, "Token hash is required"],
      index: true,
    },
    family: {
      type: String,
      required: [true, "Token family identifier is required"],
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiration date is required"],
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB TTL index: automatically deletes expired tokens
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RefreshTokenSchema.index({ family: 1, isRevoked: 1 });

export const RefreshToken = model<IRefreshToken>(
  "RefreshToken",
  RefreshTokenSchema
);

