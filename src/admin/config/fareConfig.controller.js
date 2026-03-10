import { fareConfigService } from "./fareConfig.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
  });
};

export const fareConfigController = {

  async getConfig(req, res) {
    try {

      const result = await fareConfigService.getConfig();

      return res.status(200).json({
        success: true,
        message: "Fare configuration fetched successfully",
        data: result,
      });

    } catch (error) {
      return handleError(res, error);
    }
  },

  async createConfig(req, res) {
    try {

      const result = await fareConfigService.createConfig(
        req.auth.userId,
        req.body
      );

      return res.status(201).json({
        success: true,
        message: "Fare configuration created successfully",
        data: result,
      });

    } catch (error) {
      return handleError(res, error);
    }
  },

  async updateConfig(req, res) {
    try {

      const result = await fareConfigService.updateConfig(
        req.auth.userId,
        req.body
      );

      return res.status(200).json({
        success: true,
        message: "Fare configuration updated successfully",
        data: result,
      });

    } catch (error) {
      return handleError(res, error);
    }
  }

};