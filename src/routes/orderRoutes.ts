import { Router } from "express";
import { requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { PERMISSIONS } from "../utils/permissions";
import {
  createOrderHandler,
  getOrdersHandler,
  getOrderByIdHandler,
  updateOrderHandler,
  addItemsToOrderHandler,
  updateOrderItemHandler,
  deleteOrderItemHandler,
  cancelOrderHandler,
  generateKOTHandler,
  getKOTsHandler,
  getKOTByIdHandler,
  getKitchenOrdersHandler,
  updateKOTStatusHandler,
  printKOTHandler,
  requestBillHandler,
  getBillRequestsHandler,
  confirmBillRequestHandler,
  cancelBillRequestHandler,
  createBillingHandoffHandler,
  verifyBillingHandoffHandler,
} from "../controllers/orderController";
import {
  createOrderSchema,
  updateOrderSchema,
  addOrderItemsSchema,
  updateOrderItemSchema,
  cancelOrderSchema,
  generateKOTSchema,
  updateKOTStatusSchema,
} from "../validators/orderValidators";

const router = Router();

// -------------------------------------------------------------
// 1. ORDER APIS
// -------------------------------------------------------------
router.post(
  "/orders",
  requirePermission(PERMISSIONS.ORDERS_CREATE),
  validateBody(createOrderSchema),
  createOrderHandler
);

router.get(
  "/orders",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getOrdersHandler
);

router.get(
  "/orders/:id",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getOrderByIdHandler
);

router.patch(
  "/orders/:id",
  requirePermission(PERMISSIONS.ORDERS_MANAGE),
  validateBody(updateOrderSchema),
  updateOrderHandler
);

router.post(
  "/orders/:id/items",
  requirePermission(PERMISSIONS.ORDERS_MANAGE),
  validateBody(addOrderItemsSchema),
  addItemsToOrderHandler
);

router.patch(
  "/orders/:id/items/:itemId",
  requirePermission(PERMISSIONS.ORDERS_MANAGE),
  validateBody(updateOrderItemSchema),
  updateOrderItemHandler
);

router.delete(
  "/orders/:id/items/:itemId",
  requirePermission(PERMISSIONS.ORDERS_MANAGE),
  deleteOrderItemHandler
);

router.post(
  "/orders/:id/cancel",
  requirePermission(PERMISSIONS.ORDERS_MANAGE),
  validateBody(cancelOrderSchema),
  cancelOrderHandler
);

// -------------------------------------------------------------
// 2. KOT GENERATION & MANAGEMENT
// -------------------------------------------------------------
router.post(
  "/orders/:id/kot",
  requirePermission(PERMISSIONS.KOT_MANAGE),
  validateBody(generateKOTSchema),
  generateKOTHandler
);

router.get(
  "/kots",
  requirePermission(PERMISSIONS.KOT_VIEW),
  getKOTsHandler
);

router.get(
  "/kots/:id",
  requirePermission(PERMISSIONS.KOT_VIEW),
  getKOTByIdHandler
);

router.get(
  "/kots/:id/print",
  requirePermission(PERMISSIONS.KOT_VIEW),
  printKOTHandler
);

// -------------------------------------------------------------
// 3. KITCHEN DISPLAY SYSTEM (KDS)
// -------------------------------------------------------------
router.get(
  "/kitchen/orders",
  requirePermission(PERMISSIONS.KOT_VIEW),
  getKitchenOrdersHandler
);

router.patch(
  "/kots/:id/status",
  requirePermission(PERMISSIONS.KOT_MANAGE),
  validateBody(updateKOTStatusSchema),
  updateKOTStatusHandler
);

// -------------------------------------------------------------
// 4. BILL REQUEST AND CONFIRMATION WORKFLOW
// -------------------------------------------------------------

// Waiter / Staff requests bill for an order
router.post(
  "/orders/:id/bill-request",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  requestBillHandler
);

// Cashier / Admin / Manager queries all active or historical bill requests
router.get(
  "/bill-requests",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  getBillRequestsHandler
);

// Authorized billing staff confirms bill request and generates invoice
router.post(
  "/orders/:id/bill-request/confirm",
  requirePermission(PERMISSIONS.BILLING_CREATE),
  confirmBillRequestHandler
);

// Staff cancels a pending bill request
router.post(
  "/orders/:id/bill-request/cancel",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  cancelBillRequestHandler
);

// -------------------------------------------------------------
// 5. SECURE BILLING HANDOFF WORKFLOW (Cross-App Integration)
// -------------------------------------------------------------

// Waiter App creates a cryptographically signed billing handoff token
router.post(
  "/orders/:id/billing-handoff",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  createBillingHandoffHandler
);

// POS verifies the billing handoff token
router.post(
  "/orders/:id/verify-handoff",
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  verifyBillingHandoffHandler
);

export default router;

