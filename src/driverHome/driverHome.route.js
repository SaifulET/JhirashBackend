// src/modules/driver-home/driverHome.routes.js

import express from "express";
import { driverHomeController } from "./driverHome.controller.js";
import { requireAuth } from "../core_feature/middleware/requireAuth.js";

const driverHomeRouter = express.Router();

driverHomeRouter.use(requireAuth);

// home
driverHomeRouter.get("/home",requireAuth, driverHomeController.getHome);

// online/offline + location
driverHomeRouter.patch("/go-online",requireAuth, driverHomeController.goOnline);
driverHomeRouter.patch("/go-offline",requireAuth, driverHomeController.goOffline);
driverHomeRouter.patch("/location",requireAuth, driverHomeController.updateLocation);

// request handling
driverHomeRouter.get("/ride-requests/next",requireAuth, driverHomeController.getNextRideRequest);
driverHomeRouter.get("/ride-requests/nearby",requireAuth, driverHomeController.getNearbyRideRequests);
driverHomeRouter.patch("/ride-requests/:requestId/accept",requireAuth, driverHomeController.acceptRideRequest);

// active trip
driverHomeRouter.get("/trip/active",requireAuth, driverHomeController.getActiveTrip);
driverHomeRouter.patch("/trip/:tripId/arrived-pickup",requireAuth, driverHomeController.arrivedAtPickup);
driverHomeRouter.patch("/trip/:tripId/verify-otp", driverHomeController.verifyOtp);


driverHomeRouter.patch("/trip/:tripId/start", driverHomeController.startTrip);

driverHomeRouter.get("/trip/:tripId/rider-profile", driverHomeController.getRiderProfile);

driverHomeRouter.patch("/trip/:tripId/complete", driverHomeController.completeTrip);

////remain

driverHomeRouter.patch("/trip/:tripId/cancel", driverHomeController.cancelTrip);

// completed/cancelled summary
driverHomeRouter.get("/trip/:tripId/summary", driverHomeController.getTripCompletionSummary);

export default driverHomeRouter;
