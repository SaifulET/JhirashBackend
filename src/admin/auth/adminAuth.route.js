import express from "express";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";
import { adminAuthController } from "./adminAuth.controller.js";

const adminAuthRouter = express.Router();

adminAuthRouter.post("/signin", adminAuthController.signin);
adminAuthRouter.post("/forgot-password", adminAuthController.forgotPassword);
adminAuthRouter.post("/verify-code", adminAuthController.verifyCode);
adminAuthRouter.post("/set-new-password", adminAuthController.setNewPassword);
adminAuthRouter.post("/refresh", adminAuthController.refresh);
adminAuthRouter.post("/logout", adminAuthController.logout);
adminAuthRouter.patch("/change-name", requireAuth, adminAuthController.changeName);
adminAuthRouter.patch("/change-password", requireAuth, adminAuthController.changePassword);

export default adminAuthRouter;
