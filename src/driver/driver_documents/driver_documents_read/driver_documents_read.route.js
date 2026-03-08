// src/modules/driver-onboarding-read/driverOnboardingRead.routes.js

import express from "express";
import { driverOnboardingReadController } from "./driver_documents_read.controller.js";
import { requireAuth } from "../../../core_feature/middleware/requireAuth.js";

const driverOnboardingReadRoutes = express.Router();

driverOnboardingReadRoutes.use(requireAuth);

driverOnboardingReadRoutes.get("/profile-image", driverOnboardingReadController.getProfileImage);
driverOnboardingReadRoutes.get("/license-photos", driverOnboardingReadController.getLicensePhotos);
driverOnboardingReadRoutes.get("/vehicle-registration", driverOnboardingReadController.getVehicleRegistration);
driverOnboardingReadRoutes.get("/vehicle-insurance", driverOnboardingReadController.getInsurance);
driverOnboardingReadRoutes.get("/stripe", driverOnboardingReadController.getStripeId);
driverOnboardingReadRoutes.get("/vehicle-info", driverOnboardingReadController.getVehicleInfo);

export default driverOnboardingReadRoutes;