import { Router } from "express";
import { authenticate, authorizeRoles } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  getDashboardHandler,
  createRestaurantHandler,
  getRestaurantsHandler,
  getRestaurantByIdHandler,
  updateRestaurantHandler,
  updateRestaurantStatusHandler,
  createPlanHandler,
  getPlansHandler,
  getPlanByIdHandler,
  updatePlanHandler,
  createSubscriptionHandler,
  getSubscriptionsHandler,
  getSubscriptionByIdHandler,
  updateSubscriptionHandler,
  renewSubscriptionHandler,
  cancelSubscriptionHandler,
} from "../controllers/adminController";
import {
  createRestaurantAdminSchema,
  updateRestaurantSchema,
  updateRestaurantStatusSchema,
  createPlanSchema,
  updatePlanSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
} from "../validators/adminValidators";

const router = Router();

// Protect ALL admin routes: Must be authenticated SuperAdmin
router.use(authenticate, authorizeRoles("SUPER_ADMIN"));

// -------------------------------------------------------------
// 1. DASHBOARD
// -------------------------------------------------------------
router.get("/dashboard", getDashboardHandler);

// -------------------------------------------------------------
// 2. RESTAURANTS
// -------------------------------------------------------------
router.post(
  "/restaurants",
  validateBody(createRestaurantAdminSchema),
  createRestaurantHandler
);
router.get("/restaurants", getRestaurantsHandler);
router.get("/restaurants/:id", getRestaurantByIdHandler);
router.patch(
  "/restaurants/:id",
  validateBody(updateRestaurantSchema),
  updateRestaurantHandler
);
router.patch(
  "/restaurants/:id/status",
  validateBody(updateRestaurantStatusSchema),
  updateRestaurantStatusHandler
);

// -------------------------------------------------------------
// 3. SUBSCRIPTION PLANS
// -------------------------------------------------------------
router.post("/plans", validateBody(createPlanSchema), createPlanHandler);
router.get("/plans", getPlansHandler);
router.get("/plans/:id", getPlanByIdHandler);
router.patch("/plans/:id", validateBody(updatePlanSchema), updatePlanHandler);

// -------------------------------------------------------------
// 4. SUBSCRIPTIONS
// -------------------------------------------------------------
router.post(
  "/subscriptions",
  validateBody(createSubscriptionSchema),
  createSubscriptionHandler
);
router.get("/subscriptions", getSubscriptionsHandler);
router.get("/subscriptions/:id", getSubscriptionByIdHandler);
router.patch(
  "/subscriptions/:id",
  validateBody(updateSubscriptionSchema),
  updateSubscriptionHandler
);
router.post("/subscriptions/:id/renew", renewSubscriptionHandler);
router.post("/subscriptions/:id/cancel", cancelSubscriptionHandler);

export default router;

