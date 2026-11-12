import { Request, Response, NextFunction } from "express";
import { Restaurant } from "../models/Restaurant";
import { Subscription } from "../models/Subscription";
import { SubscriptionPlan, IPlanLimits } from "../models/SubscriptionPlan";

/**
 * Validates that the calling user's restaurant has an active, unexpired subscription.
 * SuperAdmin is exempt for platform management.
 */
export const requireActiveSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    if (req.user.role === "SUPER_ADMIN") {
      next();
      return;
    }

    if (!req.user.restaurantId) {
      res.status(403).json({
        success: false,
        message: "No restaurant context associated with user.",
      });
      return;
    }

    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      res.status(404).json({ success: false, message: "Restaurant not found." });
      return;
    }

    if (restaurant.status !== "ACTIVE") {
      res.status(403).json({
        success: false,
        message: `Restaurant is ${restaurant.status.toLowerCase()}. Access denied.`,
      });
      return;
    }

    if (!restaurant.subscriptionId) {
      res.status(402).json({
        success: false,
        message: "No active subscription plan assigned to this restaurant.",
        subscriptionRequired: true,
      });
      return;
    }

    const subscription = await Subscription.findById(restaurant.subscriptionId).populate(
      "planId"
    );

    if (!subscription) {
      res.status(402).json({
        success: false,
        message: "Subscription record missing. Please contact platform support.",
        subscriptionRequired: true,
      });
      return;
    }

    const now = new Date();
    if (subscription.endDate < now) {
      if (subscription.subscriptionStatus !== "EXPIRED") {
        subscription.subscriptionStatus = "EXPIRED";
        await subscription.save();
      }

      res.status(402).json({
        success: false,
        message: "Restaurant subscription has expired. Please renew your plan.",
        subscriptionExpired: true,
      });
      return;
    }

    if (subscription.subscriptionStatus === "CANCELLED") {
      res.status(402).json({
        success: false,
        message: "Restaurant subscription has been cancelled.",
        subscriptionCancelled: true,
      });
      return;
    }

    // Attach verified subscription and plan to request context
    (req as any).subscription = subscription;
    (req as any).plan = subscription.planId;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Checks if the tenant's subscribed plan includes a specific feature flag.
 */
export const requirePlanFeature = (featureName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role === "SUPER_ADMIN") {
      next();
      return;
    }

    const plan = (req as any).plan as any;
    if (!plan || !Array.isArray(plan.features)) {
      res.status(403).json({
        success: false,
        message: "Unable to verify subscription features.",
      });
      return;
    }

    if (!plan.features.includes(featureName)) {
      res.status(403).json({
        success: false,
        message: `Feature '${featureName}' is not included in your '${plan.name}' subscription tier.`,
        requiredFeature: featureName,
        upgradeRequired: true,
      });
      return;
    }

    next();
  };
};

/**
 * Validates that resource creation does not exceed the plan's quota limits.
 */
export const checkPlanLimit = async (
  restaurantId: string,
  limitKey: keyof IPlanLimits,
  currentCount: number
): Promise<{ allowed: boolean; max: number; current: number }> => {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant || !restaurant.subscriptionId) {
    return { allowed: false, max: 0, current: currentCount };
  }

  const subscription = await Subscription.findById(restaurant.subscriptionId).populate<{
    planId: any;
  }>("planId");

  if (!subscription || !subscription.planId || !subscription.planId.limits) {
    return { allowed: false, max: 0, current: currentCount };
  }

  const max = subscription.planId.limits[limitKey] || 0;
  return {
    allowed: currentCount < max,
    max,
    current: currentCount,
  };
};

