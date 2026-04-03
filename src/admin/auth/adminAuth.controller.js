import { adminAuthService } from "./adminAuth.service.js";

const handleError = (res, error) => {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong",
  });
};

export const adminAuthController = {
  async signin(req, res) {
    try {
      console.log("Signin Request Body:", req.body);
      const result = await adminAuthService.signin(req.body);
      return res.status(200).json({
        success: true,
        message: "Admin signed in successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async forgotPassword(req, res) {
    try {
      const result = await adminAuthService.forgotPassword(req.body);
      return res.status(200).json({
        success: true,
        message: "Verification code request processed successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async verifyCode(req, res) {
    try {
      const result = await adminAuthService.verifyCode(req.body);
      return res.status(200).json({
        success: true,
        message: "Verification code checked successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async setNewPassword(req, res) {
    try {
      const result = await adminAuthService.setNewPassword(req.body);
      return res.status(200).json({
        success: true,
        message: "Password reset successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async changeName(req, res) {
    try {
      const result = await adminAuthService.changeName({
        adminUserId: req.auth.userId,
        ...req.body,
      });

      return res.status(200).json({
        success: true,
        message: "Name changed successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async changePassword(req, res) {
    try {
      const result = await adminAuthService.changePassword({
        adminUserId: req.auth.userId,
        ...req.body,
      });

      return res.status(200).json({
        success: true,
        message: "Password changed successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async refresh(req, res) {
    try {
      const result = await adminAuthService.refresh(req.body);
      return res.status(200).json({
        success: true,
        message: "Access token refreshed successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },

  async logout(req, res) {
    try {
      const result = await adminAuthService.logout(req.body);
      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
        data: result,
      });
    } catch (error) {
      return handleError(res, error);
    }
  },
};
