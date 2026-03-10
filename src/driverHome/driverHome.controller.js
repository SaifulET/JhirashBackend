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