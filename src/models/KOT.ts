import { Schema, model, Document, Types } from "mongoose";

export interface IKOTItem {
  menuItemId: Types.ObjectId;
  name: string;
  quantity: number;
  notes?: string;
  status: "PENDING" | "PREPARING" | "READY" | "CANCELLED";
}

export type KitchenStatus =
  | "PENDING"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "COMPLETED"
  | "CANCELLED";

export type KOTPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface IKOT extends Document {
  restaurantId: Types.ObjectId;
  orderId: Types.ObjectId;
  kotNumber: string;
  orderNumber?: string;
  tableNumber?: string;
  items: IKOTItem[];
  kitchenStatus: KitchenStatus;
  priority: KOTPriority;
  idempotencyKey?: string;
  acceptedAt?: Date;
  startedAt?: Date;
  readyAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KOTItemSchema = new Schema<IKOTItem>(
  {
    menuItemId: {
      type: Schema.Types.ObjectId,
      ref: "MenuItem",
      required: [true, "Menu item ID is required"],
    },
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    status: {
      type: String,
      enum: ["PENDING", "PREPARING", "READY", "CANCELLED"],
      default: "PENDING",
    },
  },
  { _id: true }
);

const KOTSchema = new Schema<IKOT>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order ID is required"],
      index: true,
    },
    kotNumber: {
      type: String,
      required: [true, "KOT number is required"],
      trim: true,
    },
    orderNumber: {
      type: String,
      trim: true,
    },
    tableNumber: {
      type: String,
      trim: true,
    },
    items: {
      type: [KOTItemSchema],
      validate: [
        (val: IKOTItem[]) => val.length > 0,
        "KOT must contain at least one item",
      ],
    },
    kitchenStatus: {
      type: String,
      enum: [
        "PENDING",
        "ACCEPTED",
        "IN_PROGRESS",
        "PREPARING",
        "READY",
        "SERVED",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "PENDING",
      index: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },
    idempotencyKey: {
      type: String,
      trim: true,
      index: true,
    },
    acceptedAt: {
      type: Date,
    },
    startedAt: {
      type: Date,
    },
    readyAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: KOT number is unique per restaurant
KOTSchema.index({ restaurantId: 1, kotNumber: 1 }, { unique: true });
KOTSchema.index({ restaurantId: 1, kitchenStatus: 1 });
KOTSchema.index({ restaurantId: 1, createdAt: -1 });

export const KOT = model<IKOT>("KOT", KOTSchema);
