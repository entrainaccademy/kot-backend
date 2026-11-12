import { Schema, model, Document, Types } from "mongoose";

export interface IRestaurantTable extends Document {
  restaurantId: Types.ObjectId;
  tableNumber: string;
  capacity: number;
  floor: string;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "OUT_OF_SERVICE";
  createdAt: Date;
  updatedAt: Date;
}

const RestaurantTableSchema = new Schema<IRestaurantTable>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    tableNumber: {
      type: String,
      required: [true, "Table number is required"],
      trim: true,
      maxlength: 20,
    },
    capacity: {
      type: Number,
      required: [true, "Capacity is required"],
      min: [1, "Capacity must be at least 1"],
      default: 4,
    },
    floor: {
      type: String,
      trim: true,
      default: "Main Dining",
    },
    status: {
      type: String,
      enum: ["AVAILABLE", "OCCUPIED", "RESERVED", "OUT_OF_SERVICE"],
      default: "AVAILABLE",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: table number is unique within each restaurant
RestaurantTableSchema.index({ restaurantId: 1, tableNumber: 1 }, { unique: true });

export const RestaurantTable = model<IRestaurantTable>(
  "RestaurantTable",
  RestaurantTableSchema
);

