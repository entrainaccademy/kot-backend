import { Request, Response, NextFunction } from "express";
import { Restaurant } from "../models/Restaurant";
import { Staff } from "../models/Staff";
import { hashPassword } from "../utils/password";
import { ALL_RESTAURANT_PERMISSIONS } from "../utils/permissions";
import { logSecurityEvent } from "../services/auditService";
import { Types } from "mongoose";

export const provisionRestaurantHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { restaurant: restData, admin: adminData } = req.body;

    // Check if slug already exists
    const existingRestaurant = await Restaurant.findOne({ slug: restData.slug });
    if (existingRestaurant) {
      res.status(400).json({
        success: false,
        message: `A restaurant with slug '${restData.slug}' already exists.`,
      });
      return;
    }

    // Check if admin email already exists anywhere
    const existingStaff = await Staff.findOne({ email: adminData.email });
    if (existingStaff) {
      res.status(400).json({
        success: false,
        message: `A staff account with email '${adminData.email}' already exists.`,
      });
      return;
    }

    // Create Restaurant
    const newRestaurant = await Restaurant.create({
      name: restData.name,
      slug: restData.slug,
      email: restData.email,
      phone: restData.phone,
      currency: restData.currency || "INR",
      timezone: restData.timezone || "Asia/Kolkata",
      address: restData.address,
      status: "ACTIVE",
    });

    // Hash Admin Password
    const hashedPassword = await hashPassword(adminData.password);

    // Create Restaurant Admin Staff Account
    const newAdmin = await Staff.create({
      restaurantId: newRestaurant._id,
      name: adminData.name,
      email: adminData.email,
      phone: adminData.phone,
      passwordHash: hashedPassword,
      role: "ADMIN",
      permissions: ALL_RESTAURANT_PERMISSIONS,
      status: "ACTIVE",
    });

    await logSecurityEvent({
      actorId: new Types.ObjectId(req.user!.id),
      action: "PROVISION_RESTAURANT",
      entityType: "Restaurant",
      entityId: newRestaurant._id as Types.ObjectId,
      restaurantId: newRestaurant._id as Types.ObjectId,
      metadata: {
        restaurantName: newRestaurant.name,
        restaurantSlug: newRestaurant.slug,
        adminEmail: newAdmin.email,
      },
    });

    res.status(201).json({
      success: true,
      message: "Restaurant and Admin provisioned successfully.",
      data: {
        restaurant: {
          id: newRestaurant._id.toString(),
          name: newRestaurant.name,
          slug: newRestaurant.slug,
          email: newRestaurant.email,
          phone: newRestaurant.phone,
          status: newRestaurant.status,
        },
        admin: {
          id: newAdmin._id.toString(),
          name: newAdmin.name,
          email: newAdmin.email,
          role: newAdmin.role,
          status: newAdmin.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

