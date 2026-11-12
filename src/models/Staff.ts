import { Schema, model, Document, Types } from "mongoose";

export type StaffRole =
  | "ADMIN"
  | "MANAGER"
  | "CASHIER"
  | "WAITER"
  | "KITCHEN_STAFF";

export interface IStaff extends Document {
  restaurantId: Types.ObjectId;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: StaffRole;
  permissions: string[];
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Staff name is required"],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, "Staff email is required"],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Staff phone is required"],
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },
    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN_STAFF"],
      required: [true, "Role is required"],
    },
    permissions: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: email must be unique per restaurant
StaffSchema.index({ restaurantId: 1, email: 1 }, { unique: true });
StaffSchema.index({ restaurantId: 1, role: 1 });

export const Staff = model<IStaff>("Staff", StaffSchema);

