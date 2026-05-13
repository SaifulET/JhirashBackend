// src/modules/driver-onboarding-read/driverOnboardingRead.controller.js

import { driverOnboardingReadService } from "./driver_documents_read.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
    error: error.error || null,
  });
};

export const driverOnboardingReadController = {
  async getSummary(req, res) {
    try {
      const result = await driverOnboardingReadService.getSummary(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Driver onboarding summary fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getProfileImage(req, res) {
    try {
      const result = await driverOnboardingReadService.getProfileImage(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Profile image fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getLicensePhotos(req, res) {
    try {
      const result = await driverOnboardingReadService.getLicensePhotos(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "License photos fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getVehicleRegistration(req, res) {
    try {
      const result = await driverOnboardingReadService.getVehicleRegistration(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Vehicle registration fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getInsurance(req, res) {
    try {
      const result = await driverOnboardingReadService.getInsurance(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Vehicle insurance fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getStripeId(req, res) {
    try {
      const result = await driverOnboardingReadService.getStripeId(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Stripe information fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getStripeApproval(req, res) {
    try {
      const result = await driverOnboardingReadService.getStripeApproval(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Stripe approval status fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getVehicleInfo(req, res) {
    try {
      const result = await driverOnboardingReadService.getVehicleInfo(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Vehicle information fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
};
