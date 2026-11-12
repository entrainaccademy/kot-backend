import { Router } from "express";
import { provisionRestaurantHandler } from "../controllers/superAdminController";
import { authenticate, authorizeRoles } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { provisionRestaurantSchema } from "../validators/authValidators";

const router = Router();

// Protected SuperAdmin Routes
router.post(
  "/restaurants",
  authenticate,
  authorizeRoles("SUPER_ADMIN"),
  validateBody(provisionRestaurantSchema),
  provisionRestaurantHandler
);

export default router;

