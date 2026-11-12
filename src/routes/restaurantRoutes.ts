import { Router } from "express";
import { authenticate, requirePermission, requireRestaurantAccess } from "../middleware/auth";
import { requireActiveSubscription } from "../middleware/subscriptionCheck";
import { validateBody } from "../middleware/validate";
import { PERMISSIONS } from "../utils/permissions";
import {
  getDashboardHandler,
  getProfileHandler,
  updateProfileHandler,
  createStaffHandler,
  getStaffHandler,
  getStaffByIdHandler,
  updateStaffHandler,
  updateStaffStatusHandler,
  createTableHandler,
  getTablesHandler,
  getTableByIdHandler,
  updateTableHandler,
  deleteTableHandler,
  createCategoryHandler,
  getCategoriesHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  createMenuItemHandler,
  getMenuItemsHandler,
  getMenuItemByIdHandler,
  updateMenuItemHandler,
  deleteMenuItemHandler,
} from "../controllers/restaurantController";
import {
  updateRestaurantProfileSchema,
  createStaffSchema,
  updateStaffSchema,
  updateStaffStatusSchema,
  createTableSchema,
  updateTableSchema,
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
} from "../validators/restaurantValidators";
import orderRoutes from "./orderRoutes";
import billingRoutes from "./billingRoutes";

const router = Router();

// Base protection for all restaurant operation routes:
// 1. Must be authenticated
// 2. Must have active restaurant tenant context
// 3. Must have an active, unexpired SaaS subscription
router.use(authenticate, requireRestaurantAccess, requireActiveSubscription);

// -------------------------------------------------------------
// 1. RESTAURANT DASHBOARD
// -------------------------------------------------------------
router.get(
  "/dashboard",
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  getDashboardHandler
);

// -------------------------------------------------------------
// 2. RESTAURANT PROFILE
// -------------------------------------------------------------
router.get(
  "/profile",
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  getProfileHandler
);
router.patch(
  "/profile",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validateBody(updateRestaurantProfileSchema),
  updateProfileHandler
);

// -------------------------------------------------------------
// 3. STAFF MANAGEMENT
// -------------------------------------------------------------
router.post(
  "/staff",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  validateBody(createStaffSchema),
  createStaffHandler
);
router.get(
  "/staff",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  getStaffHandler
);
router.get(
  "/staff/:id",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  getStaffByIdHandler
);
router.patch(
  "/staff/:id",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  validateBody(updateStaffSchema),
  updateStaffHandler
);
router.patch(
  "/staff/:id/status",
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  validateBody(updateStaffStatusSchema),
  updateStaffStatusHandler
);

// -------------------------------------------------------------
// 4. RESTAURANT TABLES
// -------------------------------------------------------------
router.post(
  "/tables",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validateBody(createTableSchema),
  createTableHandler
);
router.get(
  "/tables",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getTablesHandler
);
router.get(
  "/tables/:id",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getTableByIdHandler
);
router.patch(
  "/tables/:id",
  requirePermission(PERMISSIONS.ORDERS_MANAGE),
  validateBody(updateTableSchema),
  updateTableHandler
);
router.delete(
  "/tables/:id",
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  deleteTableHandler
);

// -------------------------------------------------------------
// 5. MENU CATEGORIES
// -------------------------------------------------------------
router.post(
  "/menu/categories",
  requirePermission(PERMISSIONS.MENU_MANAGE),
  validateBody(createCategorySchema),
  createCategoryHandler
);
router.get(
  "/menu/categories",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getCategoriesHandler
);
router.patch(
  "/menu/categories/:id",
  requirePermission(PERMISSIONS.MENU_MANAGE),
  validateBody(updateCategorySchema),
  updateCategoryHandler
);
router.delete(
  "/menu/categories/:id",
  requirePermission(PERMISSIONS.MENU_MANAGE),
  deleteCategoryHandler
);

// -------------------------------------------------------------
// 6. MENU ITEMS
// -------------------------------------------------------------
router.post(
  "/menu/items",
  requirePermission(PERMISSIONS.MENU_MANAGE),
  validateBody(createMenuItemSchema),
  createMenuItemHandler
);
router.get(
  "/menu/items",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getMenuItemsHandler
);
router.get(
  "/menu/items/:id",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getMenuItemByIdHandler
);
router.patch(
  "/menu/items/:id",
  requirePermission(PERMISSIONS.MENU_MANAGE),
  validateBody(updateMenuItemSchema),
  updateMenuItemHandler
);
router.delete(
  "/menu/items/:id",
  requirePermission(PERMISSIONS.MENU_MANAGE),
  deleteMenuItemHandler
);

// Mount Order, KOT, and Kitchen Display System routes
router.use(orderRoutes);

// Mount POS Billing, Invoices, and Payment routes
router.use(billingRoutes);

export default router;

