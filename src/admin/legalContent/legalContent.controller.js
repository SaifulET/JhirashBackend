import { legalContentService } from "./legalContent.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
  });
};

export const legalContentController = {
  async createContent(req, res) {
    try {
      const result = await legalContentService.createContent(req.auth.userId, req.body);
      return res.status(201).json({
        success: true,
        message: "Legal content created successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getAllContent(req, res) {
    try {
      const result = await legalContentService.getAllContent(req.auth.userId);
      return res.status(200).json({
        success: true,
        message: "Legal contents fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getContentByType(req, res) {
    try {
      const result = await legalContentService.getContentByType(req.params.type);
      return res.status(200).json({
        success: true,
        message: "Legal content fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async updateContent(req, res) {
    try {
      const result = await legalContentService.updateContent(
        req.auth.userId,
        req.params.type,
        req.body
      );
      return res.status(200).json({
        success: true,
        message: "Legal content updated successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async deleteContent(req, res) {
    try {
      const result = await legalContentService.deleteContent(req.auth.userId, req.params.type);
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
