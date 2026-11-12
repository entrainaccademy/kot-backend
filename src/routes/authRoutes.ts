import { Router } from "express";
import {
  loginHandler,
  refreshHandler,
  logoutHandler,
  getMeHandler,
  changePasswordHandler,
} from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loginLimiter } from "../middleware/rateLimiter";
import { loginSchema, changePasswordSchema } from "../validators/authValidators";

const router = Router();

// Public Authentication Routes
router.post("/login", loginLimiter, validateBody(loginSchema), loginHandler);
router.post("/refresh", refreshHandler);
router.post("/logout", logoutHandler);

// Protected Authentication Routes
router.get("/me", authenticate, getMeHandler);
router.post(
  "/change-password",
  authenticate,
  validateBody(changePasswordSchema),
  changePasswordHandler
);

export default router;

