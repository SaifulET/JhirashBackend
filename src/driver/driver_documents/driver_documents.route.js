// src/modules/driver-onboarding/driverOnboarding.routes.js

import express from "express";
import { driverOnboardingController } from "./driver_documents.controller.js";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";
import { SingleuploadMiddleware } from "../../core_feature/middleware/ImageHandler.js";

const routdriverOnboardingRoute = express.Router();

routdriverOnboardingRoute.use(requireAuth);

// onboarding progress
routdriverOnboardingRoute.get("/status", driverOnboardingController.getStatus);
routdriverOnboardingRoute.patch("/status", driverOnboardingController.updateStatus);

// vehicle info
routdriverOnboardingRoute.post("/vehicle", driverOnboardingController.saveVehicle);

// document uploads
routdriverOnboardingRoute.post("/profile-photo",SingleuploadMiddleware, driverOnboardingController.uploadProfilePhoto);
routdriverOnboardingRoute.post("/license-front",SingleuploadMiddleware,  driverOnboardingController.uploadLicenseFront);
routdriverOnboardingRoute.post("/license-back",SingleuploadMiddleware,  driverOnboardingController.uploadLicenseBack);
routdriverOnboardingRoute.post("/vehicle-registration",SingleuploadMiddleware,  driverOnboardingController.uploadVehicleRegistration);
routdriverOnboardingRoute.post("/vehicle-insurance",SingleuploadMiddleware, driverOnboardingController.uploadVehicleInsurance);

// stripe
routdriverOnboardingRoute.post("/stripe/onboarding-link", driverOnboardingController.createStripeOnboardingLink);
routdriverOnboardingRoute.post("/connect-stripe", driverOnboardingController.connectStripe);

// final review
routdriverOnboardingRoute.get("/review", driverOnboardingController.review);

export default routdriverOnboardingRoute;
