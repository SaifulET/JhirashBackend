import { driverManagementService } from "./driverManagement.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
  });
};

export const driverManagementController = {
  async listDrivers(req, res) {
    try {
      const result = await driverManagementService.listDrivers(req.auth.userId, req.query);
      return res.status(200).json({
        success: true,
        message: "Drivers fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverDetail(req, res) {
    try {
      const result = await driverManagementService.getDriverDetail(
        req.auth.userId,
        req.params.driverId
      );
      return res.status(200).json({
        success: true,
        message: "Driver detail fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverDocuments(req, res) {
    try {
      const result = await driverManagementService.getDriverDocuments(
        req.auth.userId,
        req.params.driverId
      );
      return res.status(200).json({
        success: true,
        message: "Driver documents fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverDocumentDetail(req, res) {
    try {
      const result = await driverManagementService.getDriverDocumentDetail(
        req.auth.userId,
        req.params.driverId,
        req.params.type
      );
      return res.status(200).json({
        success: true,
        message: "Driver document detail fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async reviewDriverDocument(req, res) {
    try {
      const result = await driverManagementService.reviewDriverDocument(
        req.auth.userId,
        req.params.driverId,
        req.params.type,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: "Driver document reviewed successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverHistory(req, res) {
    try {
      const result = await driverManagementService.getDriverHistory(
        req.auth.userId,
        req.params.driverId
      );
      return res.status(200).json({
        success: true,
        message: "Driver history fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverTripDetail(req, res) {
    try {
      const result = await driverManagementService.getDriverTripDetail(
        req.auth.userId,
        req.params.driverId,
        req.params.tripId
      );
      return res.status(200).json({
        success: true,
        message: "Driver trip detail fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getDriverReports(req, res) {
    try {
      const result = await driverManagementService.getDriverReports(
        req.auth.userId,
        req.params.driverId
      );
      return res.status(200).json({
        success: true,
        message: "Driver reports fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async updateDriverAccountStatus(req, res) {
    try {
      const result = await driverManagementService.updateDriverAccountStatus(
        req.auth.userId,
        req.params.driverId,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: "Driver account status updated successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async deleteDriver(req, res) {
    try {
      const result = await driverManagementService.deleteDriver(
        req.auth.userId,
        req.params.driverId
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

  async restoreDriver(req, res) {
    try {
      const result = await driverManagementService.restoreDriver(
        req.auth.userId,
        req.params.driverId
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
};
