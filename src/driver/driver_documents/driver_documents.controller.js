// src/modules/driver-onboarding/driverOnboarding.controller.js

import { driverOnboardingService } from "./driver_documents.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
    error: error.error || null,
  });
};

export const driverOnboardingController = {
  async getStatus(req, res) {
    try {
      const result = await driverOnboardingService.getStatus(req.auth.userId);

      return res.status(200).json({
        success: true,
        message: "Driver onboarding status fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async saveVehicle(req, res) {
    try {
      const result = await driverOnboardingService.saveVehicle(req.auth.userId, req.body);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async uploadProfilePhoto(req, res) {
    try {
        let image;
        if(req.file){
            image = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.file.key}`;
        }
      const result = await driverOnboardingService.uploadProfilePhoto(
        req.auth.userId,
        image
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

  async uploadLicenseFront(req, res) {
    try {
         let image;
        if(req.file){
            image = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.file.key}`;
        }
      const result = await driverOnboardingService.uploadLicenseFront(
        req.auth.userId,
        image
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

  async uploadLicenseBack(req, res) {
    try {
         let image;
        if(req.file){
            image = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.file.key}`;
        }
      const result = await driverOnboardingService.uploadLicenseBack(
       req.auth.userId,
        image
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

  async uploadVehicleRegistration(req, res) {
    try {
         let image;
        if(req.file){
            image = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.file.key}`;
        }
      const result = await driverOnboardingService.uploadVehicleRegistration(
       req.auth.userId,
        image
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

  async uploadVehicleInsurance(req, res) {
    try {
         let image;
        if(req.file){
            image = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${req.file.key}`;
        }
      const result = await driverOnboardingService.uploadVehicleInsurance(
         req.auth.userId,
        image
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

  async connectStripe(req, res) {
    try {
      const result = await driverOnboardingService.connectStripe(req.auth.userId, req.body);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async createStripeOnboardingLink(req, res) {
    try {
      const result = await driverOnboardingService.createStripeOnboardingLink(
        req.auth.userId,
        req.body
      );

      return res.status(200).json({
        success: true,
        message: "Stripe onboarding link created",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async review(req, res) {
    try {
      const result = await driverOnboardingService.review(req.user.id);

      return res.status(200).json({
        success: true,
        message: "Driver onboarding review fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async updateStatus(req, res) {
    try {

      const { driverId, type, status, rejectionReason } = req.body;

      const result = await driverOnboardingService.updateStatus({
        adminUserId: req.auth.userId,
        driverId,
        type,
        status,
        rejectionReason
      });

      return res.status(200).json({
        success: true,
        message: "Driver document status updated",
        data: result
      });

    } catch (error) {

      return res.status(error.status || 500).json({
        success: false,
        message: error.message || "Something went wrong"
      });

    }
  }
};
