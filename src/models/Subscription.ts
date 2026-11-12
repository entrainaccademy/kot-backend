import { Schema, model, Document, Types } from "mongoose";

export interface ISubscription extends Document {
  restaurantId: Types.ObjectId;
  planId: Types.ObjectId;
  billingCycle?: "MONTHLY" | "ANNUALLY";
  amountPaid?: number;
  startDate: Date;
  endDate: Date;
  paymentStatus: "PAID" | "PENDING" | "FAILED";
  subscriptionStatus: "ACTIVE" | "EXPIRED" | "TRIAL" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: [true, "Subscription Plan ID is required"],
    },
    billingCycle: {
      type: String,
      enum: ["MONTHLY", "ANNUALLY"],
      default: "MONTHLY",
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    paymentStatus: {
      type: String,
      enum: ["PAID", "PENDING", "FAILED"],
      default: "PENDING",
    },
    subscriptionStatus: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "TRIAL", "CANCELLED"],
      default: "TRIAL",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index to quickly query active subscriptions for a tenant
SubscriptionSchema.index({ restaurantId: 1, subscriptionStatus: 1 });

export const Subscription = model<ISubscription>(
  "Subscription",
  SubscriptionSchema
);

