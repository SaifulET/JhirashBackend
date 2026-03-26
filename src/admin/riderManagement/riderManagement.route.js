import express from "express";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";
import { riderManagementController } from "./riderManagement.controller.js";

const adminRiderManagementRouter = express.Router();

adminRiderManagementRouter.use(requireAuth);

adminRiderManagementRouter.get("/", riderManagementController.listRiders);
adminRiderManagementRouter.get("/payments", riderManagementController.listAllRiderPayments);
adminRiderManagementRouter.get("/:riderId", riderManagementController.getRiderDetail);
adminRiderManagementRouter.get("/:riderId/payments", riderManagementController.getRiderPayments);
adminRiderManagementRouter.get("/:riderId/history", riderManagementController.getRiderHistory);
adminRiderManagementRouter.get(
  "/:riderId/history/:tripId",
  riderManagementController.getRiderTripDetail
);
adminRiderManagementRouter.get("/:riderId/reports", riderManagementController.getRiderReports);
adminRiderManagementRouter.patch(
  "/:riderId/account-status",
  riderManagementController.updateRiderAccountStatus
);
adminRiderManagementRouter.delete("/:riderId", riderManagementController.deleteRider);
adminRiderManagementRouter.patch("/:riderId/restore", riderManagementController.restoreRider);

export default adminRiderManagementRouter;
