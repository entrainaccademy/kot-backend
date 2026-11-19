import { Request, Response, NextFunction } from "express";
import * as orderService from "../services/orderService";

const getParamId = (req: Request, key: string = "id"): string => {
  const val = req.params[key];
  return (Array.isArray(val) ? val[0] : val) || "";
};

const getRestaurantId = (req: Request): string => {
  return req.user?.restaurantId || "";
};

// -------------------------------------------------------------
// 1. ORDER CONTROLLERS
// -------------------------------------------------------------

export const createOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const order = await orderService.createOrder(
      restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({
      success: true,
      message: "Order created successfully.",
      data: order,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order";
    res.status(400).json({ success: false, message });
  }
};

export const getOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const result = await orderService.getOrders(restaurantId, req.query);
    res.status(200).json({
      success: true,
      data: result.orders,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const result = await orderService.getOrderById(restaurantId, id);
    res.status(200).json({
      success: true,
      data: result.order,
      kots: result.kots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Order not found";
    res.status(404).json({ success: false, message });
  }
};

export const updateOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const updated = await orderService.updateOrder(
      restaurantId,
      id,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Order updated successfully.",
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order";
    res.status(400).json({ success: false, message });
  }
};

export const addItemsToOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const updated = await orderService.addItemsToOrder(
      restaurantId,
      id,
      req.body.items,
      req.user!.id,
      req.body.idempotencyKey
    );
    res.status(200).json({
      success: true,
      message: "Items added to order successfully.",
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add items to order";
    res.status(400).json({ success: false, message });
  }
};

export const updateOrderItemHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const orderId = getParamId(req, "id");
    const itemId = getParamId(req, "itemId");
    const updated = await orderService.updateOrderItem(
      restaurantId,
      orderId,
      itemId,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Order item updated successfully.",
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update order item";
    res.status(400).json({ success: false, message });
  }
};

export const deleteOrderItemHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const orderId = getParamId(req, "id");
    const itemId = getParamId(req, "itemId");
    const updated = await orderService.deleteOrderItem(
      restaurantId,
      orderId,
      itemId,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Order item removed successfully.",
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove order item";
    res.status(400).json({ success: false, message });
  }
};

export const cancelOrderHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const cancelled = await orderService.cancelOrder(
      restaurantId,
      id,
      req.body.reason,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Order cancelled successfully.",
      data: cancelled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel order";
    res.status(400).json({ success: false, message });
  }
};

// -------------------------------------------------------------
// 2. KOT CONTROLLERS
// -------------------------------------------------------------

export const generateKOTHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const orderId = getParamId(req);
    const kot = await orderService.generateKOT(
      restaurantId,
      orderId,
      req.body,
      req.user!.id
    );
    res.status(201).json({
      success: true,
      message: "KOT generated and sent to kitchen successfully.",
      data: kot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate KOT";
    res.status(400).json({ success: false, message });
  }
};

export const getKOTsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const result = await orderService.getKOTs(restaurantId, req.query);
    res.status(200).json({
      success: true,
      data: result.kots,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getKOTByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const kot = await orderService.getKOTById(restaurantId, id);
    res.status(200).json({
      success: true,
      data: kot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "KOT not found";
    res.status(404).json({ success: false, message });
  }
};

// -------------------------------------------------------------
// 3. KITCHEN DISPLAY SYSTEM (KDS) & PRINTING
// -------------------------------------------------------------

export const getKitchenOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const kitchenOrders = await orderService.getKitchenOrders(restaurantId);
    res.status(200).json({
      success: true,
      data: kitchenOrders,
    });
  } catch (error) {
    next(error);
  }
};

export const updateKOTStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const kot = await orderService.updateKOTStatus(
      restaurantId,
      id,
      req.body.status,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: `KOT status updated to ${req.body.status}.`,
      data: kot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update KOT status";
    res.status(400).json({ success: false, message });
  }
};

export const printKOTHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const format = (req.query.format as "58mm" | "80mm") || "80mm";
    const printData = await orderService.formatKOTPrint(restaurantId, id, format);
    res.status(200).json({
      success: true,
      data: printData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to format KOT print output";
    res.status(400).json({ success: false, message });
  }
};

// -------------------------------------------------------------
// 4. BILL REQUEST CONTROLLERS
// -------------------------------------------------------------

export const requestBillHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const staffId = req.user!.id;
    const staffRole = req.user!.role;

    const order = await orderService.requestBill(restaurantId, id, staffId, staffRole);

    res.status(200).json({
      success: true,
      message: "Bill request sent successfully.",
      data: order,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request bill";
    const statusCode = message.includes("already submitted") ? 400 : 400;
    res.status(statusCode).json({ success: false, message });
  }
};

export const getBillRequestsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const result = await orderService.getBillRequests(restaurantId, {
      status: req.query.status as string,
      date: req.query.date as string,
      tableNumber: req.query.tableNumber as string,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.orders,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      pendingCount: result.pendingCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve bill requests";
    res.status(400).json({ success: false, message });
  }
};

export const confirmBillRequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const staffId = req.user!.id;
    const { discount, serviceCharge, deliveryCharge, customerName, customerPhone } = req.body || {};

    const result = await orderService.confirmBillRequest(restaurantId, id, staffId, {
      discount,
      serviceCharge,
      deliveryCharge,
      customerName,
      customerPhone,
    });

    res.status(200).json({
      success: true,
      message: "Bill confirmed and invoice generated successfully.",
      data: result.order,
      invoice: result.invoice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm bill request";
    res.status(400).json({ success: false, message });
  }
};

export const cancelBillRequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const staffId = req.user!.id;
    const staffRole = req.user!.role;
    const reason = req.body?.reason;

    const order = await orderService.cancelBillRequest(
      restaurantId,
      id,
      staffId,
      staffRole,
      reason
    );

    res.status(200).json({
      success: true,
      message: "Bill request cancelled successfully.",
      data: order,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel bill request";
    const statusCode = message.includes("Forbidden") ? 403 : 400;
    res.status(statusCode).json({ success: false, message });
  }
};

export const createBillingHandoffHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const orderId = getParamId(req);
    const userId = req.user!.id;

    const result = await orderService.createBillingHandoff(
      restaurantId,
      orderId,
      userId
    );

    res.status(200).json({
      success: true,
      message: "Billing handoff token generated successfully.",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create billing handoff";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const verifyBillingHandoffHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const orderId = getParamId(req);
    const token = req.body?.token || (req.query?.token as string);

    const order = await orderService.verifyBillingHandoff(
      restaurantId,
      orderId,
      token
    );

    res.status(200).json({
      success: true,
      message: "Billing handoff verified successfully.",
      data: order,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing handoff verification failed";
    const status = message.includes("not found") ? 404 : 403;
    res.status(status).json({ success: false, message });
  }
};

export const mergeBillsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const staffId = req.user!.id;
    const { primaryOrderId, orderIds } = req.body || {};

    if (!Array.isArray(orderIds) || orderIds.length < 2) {
      res.status(400).json({
        success: false,
        message: "At least two orders/tables are required to merge bills.",
      });
      return;
    }

    const mergedOrder = await orderService.mergeBills(
      restaurantId,
      orderIds,
      primaryOrderId,
      staffId
    );

    res.status(200).json({
      success: true,
      message: "Bills merged successfully.",
      data: mergedOrder,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to merge bills";
    res.status(400).json({ success: false, message });
  }
};


