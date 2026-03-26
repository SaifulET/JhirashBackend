import { riderManagementService } from "./riderManagement.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
  });
};

export const riderManagementController = {
  async listRiders(req, res) {
    try {
      const result = await riderManagementService.listRiders(req.auth.userId, req.query);
      return res.status(200).json({
        success: true,
        message: "Riders fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async listAllRiderPayments(req, res) {
    try {
      const result = await riderManagementService.listAllRiderPayments(
        req.auth.userId,
        req.query
      );
      return res.status(200).json({
        success: true,
        message: "All rider payments fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRiderDetail(req, res) {
    try {
      const result = await riderManagementService.getRiderDetail(
        req.auth.userId,
        req.params.riderId
      );
      return res.status(200).json({
        success: true,
        message: "Rider detail fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRiderPayments(req, res) {
    try {
      const result = await riderManagementService.getRiderPayments(
        req.auth.userId,
        req.params.riderId,
        req.query
      );
      return res.status(200).json({
        success: true,
        message: "Rider payments fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRiderHistory(req, res) {
    try {
      const result = await riderManagementService.getRiderHistory(
        req.auth.userId,
        req.params.riderId
      );
      return res.status(200).json({
        success: true,
        message: "Rider history fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRiderTripDetail(req, res) {
    try {
      const result = await riderManagementService.getRiderTripDetail(
        req.auth.userId,
        req.params.riderId,
        req.params.tripId
      );
      return res.status(200).json({
        success: true,
        message: "Rider trip detail fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getRiderReports(req, res) {
    try {
      const result = await riderManagementService.getRiderReports(
        req.auth.userId,
        req.params.riderId
      );
      return res.status(200).json({
        success: true,
        message: "Rider reports fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async updateRiderAccountStatus(req, res) {
    try {
      const result = await riderManagementService.updateRiderAccountStatus(
        req.auth.userId,
        req.params.riderId,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: "Rider account status updated successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async deleteRider(req, res) {
    try {
      const result = await riderManagementService.deleteRider(
        req.auth.userId,
        req.params.riderId
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

  async restoreRider(req, res) {
    try {
      const result = await riderManagementService.restoreRider(
        req.auth.userId,
        req.params.riderId
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
