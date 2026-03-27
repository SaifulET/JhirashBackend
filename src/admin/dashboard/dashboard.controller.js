import { dashboardService } from "./dashboard.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
  });
};

export const dashboardController = {
  async getOverview(req, res) {
    try {
      const result = await dashboardService.getOverview(req.auth.userId, req.query);
      return res.status(200).json({
        success: true,
        message: "Dashboard overview fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getAnalytics(req, res) {
    try {
      const result = await dashboardService.getAnalytics(req.auth.userId, req.query);
      return res.status(200).json({
        success: true,
        message: "Dashboard analytics fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
};
