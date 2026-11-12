import { Router } from "express";
import { requirePermission } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { PERMISSIONS } from "../utils/permissions";
import {
  createInvoiceHandler,
  getInvoicesHandler,
  getInvoiceByIdHandler,
  getInvoicePdfHandler,
  getInvoiceReceiptHandler,
  recordPaymentHandler,
  getInvoicePaymentsHandler,
  refundPaymentHandler,
  getAllPaymentsHandler,
} from "../controllers/billingController";
import {
  createInvoiceSchema,
  recordPaymentSchema,
  refundPaymentSchema,
} from "../validators/billingValidators";

const router = Router();

// -------------------------------------------------------------
// 1. INVOICE MANAGEMENT
// -------------------------------------------------------------
router.post(
  "/billing/invoices",
  requirePermission(PERMISSIONS.BILLING_CREATE),
  validateBody(createInvoiceSchema),
  createInvoiceHandler
);

router.get(
  "/billing/invoices",
  requirePermission(PERMISSIONS.BILLING_VIEW),
  getInvoicesHandler
);

router.get(
  "/billing/invoices/:id",
  requirePermission(PERMISSIONS.BILLING_VIEW),
  getInvoiceByIdHandler
);

router.get(
  "/billing/invoices/:id/pdf",
  requirePermission(PERMISSIONS.BILLING_VIEW),
  getInvoicePdfHandler
);

router.get(
  "/billing/invoices/:id/receipt",
  requirePermission(PERMISSIONS.BILLING_VIEW),
  getInvoiceReceiptHandler
);

// -------------------------------------------------------------
// 2. PAYMENT RECORDING & MANAGEMENT
// -------------------------------------------------------------
router.post(
  "/billing/invoices/:id/payments",
  requirePermission(PERMISSIONS.PAYMENTS_MANAGE),
  validateBody(recordPaymentSchema),
  recordPaymentHandler
);

router.get(
  "/billing/invoices/:id/payments",
  requirePermission(PERMISSIONS.BILLING_VIEW),
  getInvoicePaymentsHandler
);

router.get(
  "/billing/payments",
  requirePermission(PERMISSIONS.PAYMENTS_MANAGE),
  getAllPaymentsHandler
);

router.post(
  "/billing/payments/:id/refund",
  requirePermission(PERMISSIONS.PAYMENTS_MANAGE),
  validateBody(refundPaymentSchema),
  refundPaymentHandler
);

export default router;

