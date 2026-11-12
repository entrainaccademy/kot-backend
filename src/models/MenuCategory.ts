import { Schema, model, Document, Types } from "mongoose";

export interface IMenuCategory extends Document {
  restaurantId: Types.ObjectId;
  name: string;
  description?: string;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  updatedAt: Date;
}

const MenuCategorySchema = new Schema<IMenuCategory>(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant ID is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: Category name unique per restaurant
MenuCategorySchema.index({ restaurantId: 1, name: 1 }, { unique: true });
MenuCategorySchema.index({ restaurantId: 1, sortOrder: 1 });

export const MenuCategory = model<IMenuCategory>(
  "MenuCategory",
  MenuCategorySchema
);

