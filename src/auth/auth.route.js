// src/modules/auth/auth.routes.js
import { Router } from "express";
import { authController } from "./auth.controller.js";
import { requireAuth } from "../core_feature/middleware/requireAuth.js";


const UserRouter = Router();

// Public
UserRouter.post("/register", authController.register);
UserRouter.post("/login", authController.login);

// Email verification (OTP)
UserRouter.post("/send-verification", authController.sendVerification);
UserRouter.post("/verify-email", authController.verifyEmail);

// Password reset
UserRouter.post("/forgot-password", authController.forgotPassword);
UserRouter.post("/verify-reset-otp", authController.verifyResetOtp);
UserRouter.post("/reset-password", authController.resetPassword);

// Token refresh + logout
UserRouter.post("/refresh", authController.refresh);
UserRouter.post("/logout", authController.logout);

// Protected
UserRouter.get("/me", requireAuth, authController.me);
UserRouter.patch("/change-password", requireAuth, authController.changePassword);
UserRouter.delete("/delete-account", requireAuth, authController.deleteAccount);

export default UserRouter;