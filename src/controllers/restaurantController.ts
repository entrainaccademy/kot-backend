import { Request, Response, NextFunction } from "express";
import * as restaurantService from "../services/restaurantService";

const getParamId = (req: Request): string => {
  const { id } = req.params;
  return (Array.isArray(id) ? id[0] : id) || "";
};

const getRestaurantId = (req: Request): string => {
  return req.user?.restaurantId || "";
};

// -------------------------------------------------------------
// 1. DASHBOARD
// -------------------------------------------------------------

export const getDashboardHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const metrics = await restaurantService.getDashboardMetrics(restaurantId);
    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
};

// -------------------------------------------------------------
// 2. PROFILE
// -------------------------------------------------------------

export const getProfileHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const profile = await restaurantService.getRestaurantProfile(restaurantId);
    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfileHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const updated = await restaurantService.updateRestaurantProfile(
      restaurantId,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Restaurant profile updated successfully.",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// -------------------------------------------------------------
// 3. STAFF
// -------------------------------------------------------------

export const createStaffHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const staff = await restaurantService.createStaffMember(
      restaurantId,
      req.body,
      req.user!.id,
      req.user!.role
    );
    res.status(201).json({
      success: true,
      message: "Staff member created successfully.",
      data: staff,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create staff";
    res.status(400).json({ success: false, message });
  }
};

export const getStaffHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const result = await restaurantService.getStaffList(restaurantId, req.query);
    res.status(200).json({
      success: true,
      data: result.staff,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getStaffByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const staff = await restaurantService.getStaffById(restaurantId, id);
    res.status(200).json({
      success: true,
      data: staff,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Staff member not found";
    res.status(404).json({ success: false, message });
  }
};

export const updateStaffHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const updated = await restaurantService.updateStaffMember(
      restaurantId,
      id,
      req.body,
      req.user!.id,
      req.user!.role
    );
    res.status(200).json({
      success: true,
      message: "Staff member updated successfully.",
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update staff";
    res.status(400).json({ success: false, message });
  }
};

export const updateStaffStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const updated = await restaurantService.updateStaffStatus(
      restaurantId,
      id,
      req.body.status,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: `Staff status updated to ${req.body.status}.`,
      data: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update staff status";
    res.status(400).json({ success: false, message });
  }
};

// -------------------------------------------------------------
// 4. RESTAURANT TABLES
// -------------------------------------------------------------

export const createTableHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const table = await restaurantService.createTable(
      restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({
      success: true,
      message: "Table created successfully.",
      data: table,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create table";
    res.status(400).json({ success: false, message });
  }
};

export const getTablesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const tables = await restaurantService.getTables(restaurantId, req.query);
    res.status(200).json({
      success: true,
      data: tables,
    });
  } catch (error) {
    next(error);
  }
};

export const getTableByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const table = await restaurantService.getTableById(restaurantId, id);
    res.status(200).json({
      success: true,
      data: table,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Table not found";
    res.status(404).json({ success: false, message });
  }
};

export const updateTableHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const table = await restaurantService.updateTable(
      restaurantId,
      id,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Table updated successfully.",
      data: table,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update table";
    res.status(400).json({ success: false, message });
  }
};

export const deleteTableHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const deleted = await restaurantService.deleteTable(
      restaurantId,
      id,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Table deleted successfully.",
      data: deleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete table";
    res.status(400).json({ success: false, message });
  }
};

// -------------------------------------------------------------
// 5. MENU CATEGORIES
// -------------------------------------------------------------

export const createCategoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const category = await restaurantService.createCategory(
      restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({
      success: true,
      message: "Menu category created successfully.",
      data: category,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create category";
    res.status(400).json({ success: false, message });
  }
};

export const getCategoriesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const categories = await restaurantService.getCategories(restaurantId);
    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const category = await restaurantService.updateCategory(
      restaurantId,
      id,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Menu category updated successfully.",
      data: category,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update category";
    res.status(400).json({ success: false, message });
  }
};

export const deleteCategoryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const category = await restaurantService.deleteCategory(
      restaurantId,
      id,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Menu category deleted successfully.",
      data: category,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete category";
    res.status(400).json({ success: false, message });
  }
};

// -------------------------------------------------------------
// 6. MENU ITEMS
// -------------------------------------------------------------

export const createMenuItemHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const item = await restaurantService.createMenuItem(
      restaurantId,
      req.body,
      req.user!.id
    );
    res.status(201).json({
      success: true,
      message: "Menu item created successfully.",
      data: item,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create menu item";
    res.status(400).json({ success: false, message });
  }
};

export const getMenuItemsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const result = await restaurantService.getMenuItems(restaurantId, req.query);
    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getMenuItemByIdHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const item = await restaurantService.getMenuItemById(restaurantId, id);
    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Menu item not found";
    res.status(404).json({ success: false, message });
  }
};

export const updateMenuItemHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const item = await restaurantService.updateMenuItem(
      restaurantId,
      id,
      req.body,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: "Menu item updated successfully.",
      data: item,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update menu item";
    res.status(400).json({ success: false, message });
  }
};

export const deleteMenuItemHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const restaurantId = getRestaurantId(req);
    const id = getParamId(req);
    const result = await restaurantService.deleteMenuItem(
      restaurantId,
      id,
      req.user!.id
    );
    res.status(200).json({
      success: true,
      message: result.message,
      archived: result.archived,
      data: result.item,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete menu item";
    res.status(400).json({ success: false, message });
  }
};

