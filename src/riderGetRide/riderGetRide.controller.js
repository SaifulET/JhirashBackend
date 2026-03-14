
// src/modules/rider-get-ride/riderGetRide.controller.js

import { riderGetRideService } from "./riderGetRide.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
    error: error.error || null,
  });
};

export const riderGetRideController = {
  async getHome(req, res) {
    try {
      const result = await riderGetRideService.getHome(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Rider home fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRecentPlaces(req, res) {
    try {
      const result = await riderGetRideService.getRecentPlaces(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Recent places fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRideOptions(req, res) {
    try {
      const result = await riderGetRideService.getRideOptions(req.auth.userId, req.body);
      return res.status(200).json({
        success: true,
        message: "Ride options fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getPaymentMethodStatus(req, res) {
    try {
      const result = await riderGetRideService.getPaymentMethodStatus(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Payment method status fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async createPaymentSetupIntent(req, res) {
    try {
      const result = await riderGetRideService.createPaymentSetupIntent(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async savePaymentMethod(req, res) {
    try {
      const result = await riderGetRideService.savePaymentMethod(req.auth.userId, req.body);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async createRideRequest(req, res) {
    try {
      const result = await riderGetRideService.createRideRequest(req.auth.userId, req.body);
      return res.status(201).json({
        success: true,
        message: "Ride request created successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getActive(req, res) {
    try {
      const result = await riderGetRideService.getActive(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Active ride data fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async cancelRideRequest(req, res) {
    try {
      const result = await riderGetRideService.cancelRideRequest(req.auth.userId, req.params.requestId);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async cancelTrip(req, res) {
    try {
      const result = await riderGetRideService.cancelTrip(
        req.auth.userId,
        req.params.tripId,
        req.body.reason
      );
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async checkFareAfterDestinationChange(req, res) {
    try {
      const result = await riderGetRideService.checkFareAfterDestinationChange(
        req.auth.userId,
        req.params.tripId,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: "Fare checked successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async changeDestination(req, res) {
    try {
      const result = await riderGetRideService.changeDestination(
        req.auth.userId,
        req.params.tripId,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverProfile(req, res) {
    try {
      const result = await riderGetRideService.getDriverProfile(req.auth.userId, req.params.tripId);
      return res.status(200).json({
        success: true,
        message: "Driver profile fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getTripDetails(req, res) {
    try {
      const result = await riderGetRideService.getTripDetails(req.auth.userId, req.params.tripId);
      return res.status(200).json({
        success: true,
        message: "Trip details fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverReviews(req, res) {
    try {
      const result = await riderGetRideService.getDriverReviews(
        req.auth.userId,
        req.params.driverId
      );
      return res.status(200).json({
        success: true,
        message: "Driver reviews fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getTripPaymentSummary(req, res) {
    try {
      const result = await riderGetRideService.getTripPaymentSummary(
        req.auth.userId,
        req.params.tripId
      );
      return res.status(200).json({
        success: true,
        message: "Trip payment summary fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async createTripPaymentIntent(req, res) {
    try {
      const result = await riderGetRideService.createTripPaymentIntent(
        req.auth.userId,
        req.params.tripId,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async verifyTripPayment(req, res) {
    try {
      const result = await riderGetRideService.verifyTripPayment(
        req.auth.userId,
        req.params.tripId,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async submitRating(req, res) {
    try {
      const result = await riderGetRideService.submitRating(
        req.auth.userId,
        req.params.tripId,
        req.body
      );
      return res.status(201).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async createSupportTicket(req, res) {
    try {
      const result = await riderGetRideService.createSupportTicket(req.auth.userId, req.body);
      return res.status(201).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
};
