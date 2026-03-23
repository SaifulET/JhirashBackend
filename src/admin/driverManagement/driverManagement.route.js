import express from "express";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";
import { driverManagementController } from "./driverManagement.controller.js";

const adminDriverManagementRouter = express.Router();

adminDriverManagementRouter.use(requireAuth);

adminDriverManagementRouter.get("/", driverManagementController.listDrivers);
adminDriverManagementRouter.get("/:driverId", driverManagementController.getDriverDetail);
adminDriverManagementRouter.get(
  "/:driverId/documents",
  driverManagementController.getDriverDocuments
);
adminDriverManagementRouter.get(
  "/:driverId/documents/:type",
  driverManagementController.getDriverDocumentDetail
);
adminDriverManagementRouter.patch(
  "/:driverId/documents/:type/review",
  driverManagementController.reviewDriverDocument
);
adminDriverManagementRouter.get("/:driverId/history", driverManagementController.getDriverHistory);
adminDriverManagementRouter.get(
  "/:driverId/history/:tripId",
  driverManagementController.getDriverTripDetail
);
adminDriverManagementRouter.get("/:driverId/reports", driverManagementController.getDriverReports);
adminDriverManagementRouter.patch(
  "/:driverId/account-status",
  driverManagementController.updateDriverAccountStatus
);
adminDriverManagementRouter.delete("/:driverId", driverManagementController.deleteDriver);
adminDriverManagementRouter.patch("/:driverId/restore", driverManagementController.restoreDriver);

export default adminDriverManagementRouter;
