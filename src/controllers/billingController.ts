import { Request, Response } from "express";
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  recordPayment,
  refundPayment,
  getInvoicePayments,
  getAllPayments,
  generateThermalReceipt,
  generateInvoicePdf,
} from "../services/billingService";
import {
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
} from "../validators/billingValidators";

const getParamId = (req: Request, key: string = "id"): string => {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
};

export const createInvoiceHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const staffId = req.user!.id;
    const invoice = await createInvoice(restaurantId, req.body, staffId);

    res.status(201).json({
      success: true,
      message: "Invoice issued successfully",
      data: invoice,
    });
  } catch (error: any) {
    const status =
      error.message?.includes("already exists") ? 409 :
      error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const getInvoicesHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const parsedQuery = listInvoicesQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: parsedQuery.error.format(),
      });
      return;
    }

    const result = await getInvoices(restaurantId, parsedQuery.data);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getInvoiceByIdHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const id = getParamId(req);
    const result = await getInvoiceById(restaurantId, id);

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const getInvoicePdfHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const id = getParamId(req);
    const pdfBuffer = await generateInvoicePdf(restaurantId, id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="invoice-${id}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (error: any) {
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const getInvoiceReceiptHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const id = getParamId(req);
    const result = await generateThermalReceipt(restaurantId, id);

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const recordPaymentHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const invoiceId = getParamId(req);
    const staffId = req.user!.id;

    const result = await recordPayment(
      restaurantId,
      invoiceId,
      req.body,
      staffId
    );

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: result,
    });
  } catch (error: any) {
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const getInvoicePaymentsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const invoiceId = getParamId(req);
    const payments = await getInvoicePayments(restaurantId, invoiceId);

    res.status(200).json({ success: true, data: payments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const refundPaymentHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const paymentId = getParamId(req);
    const staffId = req.user!.id;

    const result = await refundPayment(
      restaurantId,
      paymentId,
      req.body,
      staffId
    );

    res.status(200).json({
      success: true,
      message: "Payment refunded successfully",
      data: result,
    });
  } catch (error: any) {
    const status = error.message?.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
};

export const getAllPaymentsHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const restaurantId = req.user!.restaurantId!;
    const parsedQuery = listPaymentsQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        errors: parsedQuery.error.format(),
      });
      return;
    }

    const result = await getAllPayments(restaurantId, parsedQuery.data);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
