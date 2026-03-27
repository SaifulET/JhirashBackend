import express from "express";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";
import { dashboardController } from "./dashboard.controller.js";

const adminDashboardRouter = express.Router();

adminDashboardRouter.use(requireAuth);

adminDashboardRouter.get("/overview", dashboardController.getOverview);
adminDashboardRouter.get("/analytics", dashboardController.getAnalytics);

export default adminDashboardRouter;
