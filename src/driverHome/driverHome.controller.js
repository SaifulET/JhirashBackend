// src/modules/driver-home/driverHome.controller.js

import { driverHomeService } from "./driverHome.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
    error: error.error || null,
  });
};

export const driverHomeController = {
  async getHome(req, res) {
    try {
      const result = await driverHomeService.getHome(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Driver home fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async goOnline(req, res) {
    try {
      const result = await driverHomeService.goOnline(req.auth.userId, req.body);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async goOffline(req, res) {
    try {
      const result = await driverHomeService.goOffline(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async updateLocation(req, res) {
    try {
      const result = await driverHomeService.updateLocation(req.auth.userId, req.body);
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getNextRideRequest(req, res) {
    try {
      const result = await driverHomeService.getNextRideRequest(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Next ride request fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getNearbyRideRequests(req, res) {
    try {
      const result = await driverHomeService.getNearbyRideRequests(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Nearby ride requests fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async acceptRideRequest(req, res) {
    try {
      const result = await driverHomeService.acceptRideRequest(
        req.auth.userId,
        req.params.requestId
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

  async getActiveTrip(req, res) {
    try {
      const result = await driverHomeService.getActiveTrip(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Active trip fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getTrips(req, res) {
    try {
      const result = await driverHomeService.getTrips(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Trips fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getEarningsSummary(req, res) {
    try {
      const result = await driverHomeService.getEarningsSummary(req.auth.userId, req.query);
      return res.status(200).json({
        success: true,
        message: "Driver earnings summary fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getTodayEarnings(req, res) {
    try {
      const result = await driverHomeService.getTodayEarnings(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Driver today earnings fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async arrivedAtPickup(req, res) {
    try {
      const result = await driverHomeService.arrivedAtPickup(
        req.auth.userId,
        req.params.tripId
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

  async verifyOtp(req, res) {
    try {
      const result = await driverHomeService.verifyOtp(
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

  async startTrip(req, res) {
    try {
      const result = await driverHomeService.startTrip(
        req.auth.userId,
        req.params.tripId
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

  async getRiderProfile(req, res) {
    try {
      const result = await driverHomeService.getRiderProfile(
        req.auth.userId,
        req.params.tripId
      );
      return res.status(200).json({
        success: true,
        message: "Rider profile fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRiderReviews(req, res) {
    try {
      const result = await driverHomeService.getRiderReviews(
        req.auth.userId,
        req.params.riderId
      );
      return res.status(200).json({
        success: true,
        message: "Rider reviews fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getMyReviews(req, res) {
    try {
      const result = await driverHomeService.getMyReviews(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Driver reviews fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async submitRiderRating(req, res) {
    try {
      const result = await driverHomeService.submitRiderRating(
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

  async completeTrip(req, res) {
    try {
      const result = await driverHomeService.completeTrip(
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

  async cancelTrip(req, res) {
    try {
      const result = await driverHomeService.cancelTrip(
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

  async getTripCompletionSummary(req, res) {
    try {
      const result = await driverHomeService.getTripCompletionSummary(
        req.auth.userId,
        req.params.tripId
      );
      return res.status(200).json({
        success: true,
        message: "Trip summary fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
};
