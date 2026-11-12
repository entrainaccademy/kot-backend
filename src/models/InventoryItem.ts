import { Schema, model, Document, Types } from "mongoose";

export type InventoryUnit =
  | "KG"
  | "GRAM"
  | "LITRE"
  | "ML"
  | "PIECE"
  | "PACKET"
  | "BOX";

export interface IInventoryItem extends Document {
  restaurantId: Types.ObjectId;
  name: string;
  sku?: string;
  unit: InventoryUnit;
  currentStock: number;
  minimumStock: number;
  costPrice: number;
  supplierId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Item name is required"],
      trim: true,
      maxlength: 120,
    },
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },
    unit: {
      type: String,
      enum: ["KG", "GRAM", "LITRE", "ML", "PIECE", "PACKET", "BOX"],
      default: "PIECE",
    },
    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Current stock cannot be negative"],
    },
    minimumStock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Minimum stock cannot be negative"],
    },
    costPrice: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Cost price cannot be negative"],
      set: (val: number) => Math.round(val * 100) / 100,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique indexes
InventoryItemSchema.index({ restaurantId: 1, name: 1 }, { unique: true });
InventoryItemSchema.index(
  { restaurantId: 1, sku: 1 },
  { unique: true, sparse: true }
);

export const InventoryItem = model<IInventoryItem>(
  "InventoryItem",
  InventoryItemSchema
);

