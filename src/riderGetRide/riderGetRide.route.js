// src/modules/rider-get-ride/riderGetRide.routes.js

import express from "express";
import { riderGetRideController } from "./riderGetRide.controller.js";
import { requireAuth } from "../core_feature/middleware/requireAuth.js";

const riderGetRideRouter = express.Router();

riderGetRideRouter.use(requireAuth);

// home
riderGetRideRouter.get("/home", riderGetRideController.getHome);
riderGetRideRouter.get("/recent-places",requireAuth, riderGetRideController.getRecentPlaces);

// fare / ride options
riderGetRideRouter.post("/ride-options",requireAuth, riderGetRideController.getRideOptions);
riderGetRideRouter.post("/nearby-drivers", requireAuth, riderGetRideController.getNearbyOnlineDrivers);
riderGetRideRouter.get("/payment-method", riderGetRideController.getPaymentMethodStatus);
riderGetRideRouter.post("/payment-method/setup-intent", riderGetRideController.createPaymentSetupIntent);
riderGetRideRouter.post("/payment-method/save", riderGetRideController.savePaymentMethod);

// request
riderGetRideRouter.post("/ride-request", riderGetRideController.createRideRequest);
riderGetRideRouter.get("/active", riderGetRideController.getActive);
riderGetRideRouter.get("/trips",requireAuth, riderGetRideController.getTrips);
riderGetRideRouter.patch(
  "/ride-request/:requestId/change-destination",
  requireAuth,
  riderGetRideController.changeRideRequestDestination
);
riderGetRideRouter.patch("/ride-request/:requestId/cancel", riderGetRideController.cancelRideRequest);

// trip
riderGetRideRouter.patch("/trip/:tripId/cancel",requireAuth, riderGetRideController.cancelTrip);


riderGetRideRouter.post("/trip/:tripId/check-fare",requireAuth, riderGetRideController.checkFareAfterDestinationChange);

riderGetRideRouter.patch("/trip/:tripId/change-destination",requireAuth, riderGetRideController.changeDestination);

riderGetRideRouter.get("/trip/:tripId/driver-profile",requireAuth, riderGetRideController.getDriverProfile);
riderGetRideRouter.get("/drivers/:driverId/reviews", riderGetRideController.getDriverReviews);

riderGetRideRouter.get("/trip/:tripId/details",requireAuth, riderGetRideController.getTripDetails);

riderGetRideRouter.get("/trip/:tripId/payment-summary",  riderGetRideController.getTripPaymentSummary);
riderGetRideRouter.post("/trip/:tripId/payment-intent", riderGetRideController.createTripPaymentIntent);
riderGetRideRouter.post("/trip/:tripId/payment-verify", riderGetRideController.verifyTripPayment);

// rating
riderGetRideRouter.post("/trip/:tripId/rating", riderGetRideController.submitRating);
riderGetRideRouter.post("/trip/:tripId/driver-review", riderGetRideController.submitRating);

// support
riderGetRideRouter.post("/support-ticket", riderGetRideController.createSupportTicket);

export default riderGetRideRouter;
