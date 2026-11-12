import { Schema, model, Document, Types } from "mongoose";

export type StockTransactionType =
  | "PURCHASE"
  | "USAGE"
  | "WASTAGE"
  | "ADJUSTMENT"
  | "RETURN";

export interface IStockTransaction extends Document {
  restaurantId: Types.ObjectId;
  inventoryItemId: Types.ObjectId;
  transactionType: StockTransactionType;
  quantity: number;
  reference?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StockTransactionSchema = new Schema<IStockTransaction>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: [true, "Inventory item ID is required"],
      index: true,
    },
    transactionType: {
      type: String,
      enum: ["PURCHASE", "USAGE", "WASTAGE", "ADJUSTMENT", "RETURN"],
      required: [true, "Transaction type is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Transaction quantity is required"],
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 150,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: [true, "Staff ID who created the transaction is required"],
    },
  },
  {
    timestamps: true,
  }
);

StockTransactionSchema.index({ restaurantId: 1, inventoryItemId: 1 });
StockTransactionSchema.index({ restaurantId: 1, createdAt: -1 });

export const StockTransaction = model<IStockTransaction>(
  "StockTransaction",
  StockTransactionSchema
);

