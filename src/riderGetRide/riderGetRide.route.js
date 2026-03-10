// src/modules/rider-get-ride/riderGetRide.routes.js

import express from "express";
import { riderGetRideController } from "./riderGetRide.controller.js";
import { requireAuth } from "../core_feature/middleware/requireAuth.js";

const riderGetRideRouter = express.Router();

riderGetRideRouter.use(requireAuth);

// home
riderGetRideRouter.get("/home", riderGetRideController.getHome);
riderGetRideRouter.get("/recent-places", riderGetRideController.getRecentPlaces);

// fare / ride options
riderGetRideRouter.post("/ride-options", riderGetRideController.getRideOptions);

// request
riderGetRideRouter.post("/ride-request", riderGetRideController.createRideRequest);
riderGetRideRouter.get("/active", riderGetRideController.getActive);
riderGetRideRouter.patch("/ride-request/:requestId/cancel", riderGetRideController.cancelRideRequest);

// trip
riderGetRideRouter.patch("/trip/:tripId/cancel", riderGetRideController.cancelTrip);
riderGetRideRouter.post("/trip/:tripId/check-fare", riderGetRideController.checkFareAfterDestinationChange);
riderGetRideRouter.patch("/trip/:tripId/change-destination", riderGetRideController.changeDestination);
riderGetRideRouter.get("/trip/:tripId/driver-profile", riderGetRideController.getDriverProfile);
riderGetRideRouter.get("/trip/:tripId/details", riderGetRideController.getTripDetails);

// rating
riderGetRideRouter.post("/trip/:tripId/rating", riderGetRideController.submitRating);

// support
riderGetRideRouter.post("/support-ticket", riderGetRideController.createSupportTicket);

export default riderGetRideRouter;