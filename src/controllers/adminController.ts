import { Request, Response, NextFunction } from "express";
import * as adminService from "../services/adminService";

const getParamId = (req: Request): string => {
  const { id } = req.params;
  return (Array.isArray(id) ? id[0] : id) || "";
};

// -------------------------------------------------------------
// DASHBOARD
// -------------------------------------------------------------

export const getDashboardHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const metrics = await adminService.getDashboardMetrics();
    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

// -------------------------------------------------------------
// RESTAURANTS
// -------------------------------------------------------------

export const createRestaurantHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await adminService.createRestaurantWithAdmin(
      req.body,
      req.user!.id
    );
    res.status(201).json({
      success: true,
      message: "Restaurant and Administrator created successfully.",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create restaurant";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const getRestaurantsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await adminService.getRestaurants(req.query);
    res.status(200).json({
      success: true,
      data: result.restaurants,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getRestaurantByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const restaurant = await adminService.getRestaurantById(id);
    res.status(200).json({
      success: true,
      data: restaurant,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Restaurant not found";
    res.status(404).json({
      success: false,
      message,
    });
  }
};

export const updateRestaurantHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const updated = await adminService.updateRestaurant(
      id,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Restaurant updated successfully.",
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update restaurant";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const updateRestaurantStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const { status, reason } = req.body;
    const updated = await adminService.updateRestaurantStatus(
      id,
      status,
      reason,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: `Restaurant status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

// -------------------------------------------------------------
// SUBSCRIPTION PLANS
// -------------------------------------------------------------

export const createPlanHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const plan = await adminService.createPlan(req.body, req.user!.id);
    res.status(201).json({
      success: true,
      message: "Subscription plan created successfully.",
      data: plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create plan";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const getPlansHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const plans = await adminService.getPlans(status);
    res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    next(error);
  }
};

export const getPlanByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const plan = await adminService.getPlanById(id);
    res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Plan not found";
    res.status(404).json({
      success: false,
      message,
    });
  }
};

export const updatePlanHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const plan = await adminService.updatePlan(id, req.body, req.user!.id);
    res.status(200).json({
      success: true,
      message: "Plan updated successfully.",
      data: plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update plan";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

// -------------------------------------------------------------
// SUBSCRIPTIONS
// -------------------------------------------------------------

export const createSubscriptionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const subscription = await adminService.createSubscription(
      req.body,
      req.user!.id
    );
    res.status(201).json({
      success: true,
      message: "Subscription created and assigned successfully.",
      data: subscription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create subscription";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const getSubscriptionsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await adminService.getSubscriptions(req.query);
    res.status(200).json({
      success: true,
      data: result.subscriptions,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getSubscriptionByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const subscription = await adminService.getSubscriptionById(id);
    res.status(200).json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Subscription not found";
    res.status(404).json({
      success: false,
      message,
    });
  }
};

export const updateSubscriptionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const subscription = await adminService.updateSubscription(
      id,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Subscription updated successfully.",
      data: subscription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update subscription";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const renewSubscriptionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const subscription = await adminService.renewSubscription(id, req.user!.id);
    res.status(200).json({
      success: true,
      message: "Subscription renewed successfully.",
      data: subscription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to renew subscription";
    res.status(400).json({
      success: false,
      message,
    });
  }
};

export const cancelSubscriptionHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = getParamId(req);
    const subscription = await adminService.cancelSubscription(id, req.user!.id);
    res.status(200).json({
      success: true,
      message: "Subscription cancelled successfully.",
      data: subscription,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel subscription";
    res.status(400).json({
      success: false,
      message,
    });
  }
};
