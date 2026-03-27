import { customerSupportService } from "./customerSupport.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
  });
};

export const customerSupportController = {
  async listItems(req, res) {
    try {
      const result = await customerSupportService.listItems(req.auth.userId, req.query);
      return res.status(200).json({
        success: true,
        message: "Customer support items fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async getItemDetail(req, res) {
    try {
      const result = await customerSupportService.getItemDetail(
        req.auth.userId,
        req.params.entryId
      );
      return res.status(200).json({
        success: true,
        message: "Customer support item fetched successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async takeAction(req, res) {
    try {
      const result = await customerSupportService.takeAction(
        req.auth.userId,
        req.params.entryId,
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

  async deleteItem(req, res) {
    try {
      const result = await customerSupportService.deleteItem(
        req.auth.userId,
        req.params.entryId
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
