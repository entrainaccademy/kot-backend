import { Schema, model, Document } from "mongoose";

export interface IPlanLimits {
  maxTables: number;
  maxStaff: number;
  maxOrdersPerMonth: number;
  maxMenuItems: number;
}

export interface ISubscriptionPlan extends Document {
  name: "Basic" | "Standard" | "Premium" | string;
  price: number; // In Rupees (or paise)
  billingCycle: "MONTHLY" | "ANNUALLY";
  features: string[];
  limits: IPlanLimits;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
}

const PlanLimitsSchema = new Schema<IPlanLimits>(
  {
    maxTables: { type: Number, required: true, default: 10, min: 1 },
    maxStaff: { type: Number, required: true, default: 5, min: 1 },
    maxOrdersPerMonth: { type: Number, required: true, default: 1000, min: 1 },
    maxMenuItems: { type: Number, required: true, default: 50, min: 1 },
  },
  { _id: false }
);

const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
      unique: true,
    },
    price: {
      type: Number,
      required: [true, "Plan price is required"],
      min: [0, "Price cannot be negative"],
    },
    billingCycle: {
      type: String,
      enum: ["MONTHLY", "ANNUALLY"],
      default: "MONTHLY",
    },
    features: {
      type: [String],
      default: [],
    },
    limits: {
      type: PlanLimitsSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "ARCHIVED"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

export const SubscriptionPlan = model<ISubscriptionPlan>(
  "SubscriptionPlan",
  SubscriptionPlanSchema
);

