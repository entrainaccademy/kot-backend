import { Types } from "mongoose";
import { Restaurant, IRestaurant } from "../models/Restaurant";
import { Staff } from "../models/Staff";
import { SubscriptionPlan, ISubscriptionPlan } from "../models/SubscriptionPlan";
import { Subscription, ISubscription } from "../models/Subscription";
import { hashPassword } from "../utils/password";
import { ALL_RESTAURANT_PERMISSIONS } from "../utils/permissions";
import { logSecurityEvent } from "./auditService";

// -------------------------------------------------------------
// 1. DASHBOARD ANALYTICS & METRICS
// -------------------------------------------------------------

export const getDashboardMetrics = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    totalRestaurants,
    activeRestaurants,
    suspendedRestaurants,
    activeSubscriptions,
    expiredSubscriptions,
    revenueResult,
    recentRestaurants,
    subscriptionExpiryAlerts,
  ] = await Promise.all([
    Restaurant.countDocuments(),
    Restaurant.countDocuments({ status: "ACTIVE" }),
    Restaurant.countDocuments({ status: "SUSPENDED" }),
    Subscription.countDocuments({ subscriptionStatus: "ACTIVE" }),
    Subscription.countDocuments({ subscriptionStatus: "EXPIRED" }),
    Subscription.aggregate([
      {
        $match: {
          paymentStatus: "PAID",
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amountPaid" },
        },
      },
    ]),
    Restaurant.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name slug email phone status createdAt"),
    Subscription.find({
      subscriptionStatus: "ACTIVE",
      endDate: { $gte: now, $lte: sevenDaysFromNow },
    })
      .populate("restaurantId", "name slug email")
      .populate("planId", "name price billingCycle")
      .sort({ endDate: 1 }),
  ]);

  const monthlySubscriptionRevenue =
    revenueResult.length > 0 && revenueResult[0].totalRevenue
      ? revenueResult[0].totalRevenue
      : 0;

  return {
    totalRestaurants,
    activeRestaurants,
    suspendedRestaurants,
    activeSubscriptions,
    expiredSubscriptions,
    monthlySubscriptionRevenue,
    recentRestaurants,
    subscriptionExpiryAlerts,
  };
};

// -------------------------------------------------------------
// 2. RESTAURANT MANAGEMENT
// -------------------------------------------------------------

export interface CreateRestaurantInput {
  restaurant: {
    name: string;
    slug: string;
    email: string;
    phone: string;
    currency?: string;
    timezone?: string;
    address?: any;
    taxSettings?: any;
  };
  admin: {
    name: string;
    email: string;
    phone: string;
    password: string;
  };
}

export const createRestaurantWithAdmin = async (
  input: CreateRestaurantInput,
  actorId: string
) => {
  const { restaurant: restData, admin: adminData } = input;
  const slug = restData.slug.toLowerCase().trim();
  const adminEmail = adminData.email.toLowerCase().trim();

  // Validate uniqueness
  const [existingSlug, existingEmail] = await Promise.all([
    Restaurant.findOne({ slug }),
    Staff.findOne({ email: adminEmail }),
  ]);

  if (existingSlug) {
    throw new Error(`A restaurant with slug '${slug}' already exists.`);
  }
  if (existingEmail) {
    throw new Error(`An administrator account with email '${adminEmail}' already exists.`);
  }

  // Compensating transaction safety
  let createdRestaurant: IRestaurant | null = null;
  try {
    createdRestaurant = await Restaurant.create({
      name: restData.name,
      slug,
      email: restData.email.toLowerCase().trim(),
      phone: restData.phone,
      currency: restData.currency || "INR",
      timezone: restData.timezone || "Asia/Kolkata",
      address: restData.address || {},
      taxSettings: restData.taxSettings || { defaultTaxRate: 5, isTaxInclusive: false },
      status: "ACTIVE",
    });

    const hashedPassword = await hashPassword(adminData.password);
    const createdAdmin = await Staff.create({
      restaurantId: createdRestaurant._id,
      name: adminData.name,
      email: adminEmail,
      phone: adminData.phone,
      passwordHash: hashedPassword,
      role: "ADMIN",
      permissions: ALL_RESTAURANT_PERMISSIONS,
      status: "ACTIVE",
    });

    await logSecurityEvent({
      actorId,
      action: "RESTAURANT_CREATED",
      entityType: "Restaurant",
      entityId: createdRestaurant._id.toString(),
      restaurantId: createdRestaurant._id.toString(),
      metadata: {
        restaurantName: createdRestaurant.name,
        restaurantSlug: createdRestaurant.slug,
        adminEmail: createdAdmin.email,
      },
    });

    return {
      restaurant: {
        id: createdRestaurant._id.toString(),
        name: createdRestaurant.name,
        slug: createdRestaurant.slug,
        email: createdRestaurant.email,
        phone: createdRestaurant.phone,
        status: createdRestaurant.status,
        createdAt: createdRestaurant.createdAt,
      },
      admin: {
        id: createdAdmin._id.toString(),
        name: createdAdmin.name,
        email: createdAdmin.email,
        phone: createdAdmin.phone,
        role: createdAdmin.role,
        status: createdAdmin.status,
      },
    };
  } catch (error) {
    // Rollback restaurant if staff creation fails
    if (createdRestaurant && createdRestaurant._id) {
      await Restaurant.findByIdAndDelete(createdRestaurant._id);
    }
    throw error;
  }
};

export const getRestaurants = async (params: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) => {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const query: any = {};

  if (params.status) {
    query.status = params.status;
  }

  if (params.search) {
    const searchRegex = new RegExp(params.search.trim(), "i");
    query.$or = [{ name: searchRegex }, { slug: searchRegex }, { email: searchRegex }];
  }

  const sortField = params.sortBy || "createdAt";
  const sortDirection = params.sortOrder === "asc" ? 1 : -1;

  const [restaurants, total] = await Promise.all([
    Restaurant.find(query)
      .populate("subscriptionId", "planId startDate endDate subscriptionStatus paymentStatus")
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limit)
      .lean(),
    Restaurant.countDocuments(query),
  ]);

  return {
    restaurants,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getRestaurantById = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid restaurant ID format.");
  }

  const restaurant = await Restaurant.findById(id)
    .populate({
      path: "subscriptionId",
      populate: { path: "planId", select: "name price billingCycle limits features" },
    })
    .lean();

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }

  // Retrieve assigned admin staff and subscription history
  const [adminStaff, subscriptions] = await Promise.all([
    Staff.findOne({ restaurantId: id, role: "ADMIN" })
      .select("name email phone role status createdAt")
      .lean(),
    Subscription.find({ restaurantId: id })
      .populate("planId", "name price billingCycle")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return {
    ...restaurant,
    admin: adminStaff || null,
    subscriptionHistory: subscriptions,
  };
};

export const updateRestaurant = async (
  id: string,
  updateData: any,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid restaurant ID format.");
  }

  // Prevent modifying immutable fields like _id or slug directly
  const safeData = { ...updateData };
  delete safeData._id;
  delete safeData.slug;
  delete safeData.createdAt;

  const restaurant = await Restaurant.findByIdAndUpdate(id, safeData, {
    new: true,
    runValidators: true,
  });

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "RESTAURANT_UPDATED",
    entityType: "Restaurant",
    entityId: id,
    restaurantId: id,
    metadata: { updatedFields: Object.keys(safeData) },
  });

  return restaurant;
};

export const updateRestaurantStatus = async (
  id: string,
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE",
  reason: string | undefined,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid restaurant ID format.");
  }

  const restaurant = await Restaurant.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  );

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "RESTAURANT_STATUS_CHANGED",
    entityType: "Restaurant",
    entityId: id,
    restaurantId: id,
    metadata: { status, reason },
  });

  return restaurant;
};

// -------------------------------------------------------------
// 3. SAAS SUBSCRIPTION PLANS
// -------------------------------------------------------------

export const createPlan = async (data: any, actorId: string) => {
  const existing = await SubscriptionPlan.findOne({ name: data.name.trim() });
  if (existing) {
    throw new Error(`Subscription plan with name '${data.name}' already exists.`);
  }

  const plan = await SubscriptionPlan.create(data);

  await logSecurityEvent({
    actorId,
    action: "PLAN_CREATED",
    entityType: "SubscriptionPlan",
    entityId: plan._id.toString(),
    metadata: { planName: plan.name, price: plan.price },
  });

  return plan;
};

export const getPlans = async (status?: string) => {
  const query: any = {};
  if (status) {
    query.status = status;
  }
  return SubscriptionPlan.find(query).sort({ price: 1 });
};

export const getPlanById = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid plan ID format.");
  }
  const plan = await SubscriptionPlan.findById(id);
  if (!plan) {
    throw new Error("Subscription plan not found.");
  }
  return plan;
};

export const updatePlan = async (id: string, updateData: any, actorId: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid plan ID format.");
  }

  const safeData = { ...updateData };
  delete safeData._id;

  const plan = await SubscriptionPlan.findByIdAndUpdate(id, safeData, {
    new: true,
    runValidators: true,
  });

  if (!plan) {
    throw new Error("Subscription plan not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "PLAN_UPDATED",
    entityType: "SubscriptionPlan",
    entityId: id,
    metadata: { updatedFields: Object.keys(safeData) },
  });

  return plan;
};

// -------------------------------------------------------------
// 4. SUBSCRIPTION MANAGEMENT
// -------------------------------------------------------------

export const createSubscription = async (data: any, actorId: string) => {
  const [restaurant, plan] = await Promise.all([
    Restaurant.findById(data.restaurantId),
    SubscriptionPlan.findById(data.planId),
  ]);

  if (!restaurant) {
    throw new Error("Restaurant not found.");
  }
  if (!plan) {
    throw new Error("Subscription plan not found.");
  }

  // Deactivate / Expire any existing active subscriptions to prevent overlapping active subscriptions
  await Subscription.updateMany(
    {
      restaurantId: data.restaurantId,
      subscriptionStatus: { $in: ["ACTIVE", "TRIAL"] },
    },
    { subscriptionStatus: "EXPIRED" }
  );

  const billingCycle = data.billingCycle || plan.billingCycle || "MONTHLY";
  const startDate = data.startDate ? new Date(data.startDate) : new Date();
  const endDate = new Date(startDate);

  if (billingCycle === "ANNUALLY") {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setDate(endDate.getDate() + 30);
  }

  const paymentStatus = data.paymentStatus || "PENDING";
  const amountPaid =
    data.amountPaid !== undefined
      ? data.amountPaid
      : paymentStatus === "PAID"
      ? plan.price
      : 0;

  const subscriptionStatus = paymentStatus === "PAID" ? "ACTIVE" : "TRIAL";

  const subscription = await Subscription.create({
    restaurantId: restaurant._id,
    planId: plan._id,
    billingCycle,
    amountPaid,
    startDate,
    endDate,
    paymentStatus,
    subscriptionStatus,
  });

  // Attach subscriptionId to restaurant
  restaurant.subscriptionId = subscription._id as Types.ObjectId;
  await restaurant.save();

  await logSecurityEvent({
    actorId,
    action: "SUBSCRIPTION_CREATED",
    entityType: "Subscription",
    entityId: subscription._id.toString(),
    restaurantId: restaurant._id.toString(),
    metadata: {
      planName: plan.name,
      billingCycle,
      paymentStatus,
      subscriptionStatus,
      amountPaid,
    },
  });

  return subscription;
};

export const getSubscriptions = async (params: {
  restaurantId?: string;
  planId?: string;
  subscriptionStatus?: string;
  paymentStatus?: string;
  page?: number;
  limit?: number;
}) => {
  const page = Math.max(Number(params.page) || 1, 1);
  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const query: any = {};
  if (params.restaurantId && Types.ObjectId.isValid(params.restaurantId)) {
    query.restaurantId = params.restaurantId;
  }
  if (params.planId && Types.ObjectId.isValid(params.planId)) {
    query.planId = params.planId;
  }
  if (params.subscriptionStatus) {
    query.subscriptionStatus = params.subscriptionStatus;
  }
  if (params.paymentStatus) {
    query.paymentStatus = params.paymentStatus;
  }

  const [subscriptions, total] = await Promise.all([
    Subscription.find(query)
      .populate("restaurantId", "name slug email status")
      .populate("planId", "name price billingCycle limits features")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Subscription.countDocuments(query),
  ]);

  return {
    subscriptions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getSubscriptionById = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid subscription ID format.");
  }
  const subscription = await Subscription.findById(id)
    .populate("restaurantId", "name slug email status")
    .populate("planId", "name price billingCycle limits features");

  if (!subscription) {
    throw new Error("Subscription not found.");
  }
  return subscription;
};

export const updateSubscription = async (
  id: string,
  updateData: any,
  actorId: string
) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid subscription ID format.");
  }

  const subscription = await Subscription.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!subscription) {
    throw new Error("Subscription not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "SUBSCRIPTION_UPDATED",
    entityType: "Subscription",
    entityId: id,
    restaurantId: subscription.restaurantId.toString(),
    metadata: { updatedFields: Object.keys(updateData) },
  });

  return subscription;
};

export const renewSubscription = async (id: string, actorId: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid subscription ID format.");
  }

  const subscription = await Subscription.findById(id).populate("planId");
  if (!subscription) {
    throw new Error("Subscription not found.");
  }

  const plan = subscription.planId as any;
  const now = new Date();
  const baseDate = subscription.endDate > now ? new Date(subscription.endDate) : now;
  const newEndDate = new Date(baseDate);

  if (subscription.billingCycle === "ANNUALLY") {
    newEndDate.setFullYear(newEndDate.getFullYear() + 1);
  } else {
    newEndDate.setDate(newEndDate.getDate() + 30);
  }

  subscription.endDate = newEndDate;
  subscription.paymentStatus = "PAID";
  subscription.subscriptionStatus = "ACTIVE";
  if (plan && plan.price) {
    subscription.amountPaid = (subscription.amountPaid || 0) + plan.price;
  }

  await subscription.save();

  // Ensure restaurant status is active and linked
  await Restaurant.findByIdAndUpdate(subscription.restaurantId, {
    status: "ACTIVE",
    subscriptionId: subscription._id,
  });

  await logSecurityEvent({
    actorId,
    action: "SUBSCRIPTION_RENEWED",
    entityType: "Subscription",
    entityId: id,
    restaurantId: subscription.restaurantId.toString(),
    metadata: {
      newEndDate,
      paymentStatus: subscription.paymentStatus,
      subscriptionStatus: subscription.subscriptionStatus,
    },
  });

  return subscription;
};

export const cancelSubscription = async (id: string, actorId: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid subscription ID format.");
  }

  const subscription = await Subscription.findByIdAndUpdate(
    id,
    { subscriptionStatus: "CANCELLED" },
    { new: true }
  );

  if (!subscription) {
    throw new Error("Subscription not found.");
  }

  await logSecurityEvent({
    actorId,
    action: "SUBSCRIPTION_CANCELLED",
    entityType: "Subscription",
    entityId: id,
    restaurantId: subscription.restaurantId.toString(),
    metadata: { subscriptionStatus: "CANCELLED" },
  });

  return subscription;
};

