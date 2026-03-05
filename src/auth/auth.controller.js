// src/modules/auth/auth.controller.js

import { authService } from "./auth.service.js";


function sanitizeUser(u) {
  if (!u) return u;
  const user = typeof u.toObject === "function" ? u.toObject() : { ...u };
  delete user.passwordHash;
  delete user.__v;
  return user;
}

function handleError(res, e) {
  const status = e?.status || 500;
  const code = e?.code || "INTERNAL_ERROR";
  const message = e?.message || "Something went wrong";
  return res.status(status).json({ success: false, error: { code, message, details: e?.details } });
}

export const authController = {
  async register(req, res) {
    try {
      const out = await authService.register(req.body);
      return res.status(201).json({
        success: true,
        data: {
          user: sanitizeUser(out.user),
          message: "Registered. Verification code sent.",
          otpForDev: out.otpForDev, // remove in production
        },
      });
    } catch (e) {
        console.log(e,"dkk")
      return handleError(res, e);
    }
  },

  async login(req, res) {
    try {
      const out = await authService.login(req.body);
      return res.json({
        success: true,
        data: { accessToken: out.accessToken, refreshToken: out.refreshToken, user: sanitizeUser(out.user) },
      });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async sendVerification(req, res) {
    try {
      const out = await authService.sendVerificationOtp(req.body);
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async verifyEmail(req, res) {
    try {
      const out = await authService.verifyEmailOtp(req.body);
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async forgotPassword(req, res) {
    try {
      const out = await authService.forgotPassword(req.body);
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async verifyResetOtp(req, res) {
    try {
      const out = await authService.verifyResetOtp(req.body);
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async resetPassword(req, res) {
    try {
      const out = await authService.resetPassword(req.body);
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async changePassword(req, res) {
    try {
      const out = await authService.changePassword({ userId: req.auth.userId, ...req.body });
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async me(req, res) {
    try {
      const user = await authService.me({ userId: req.auth.userId });
      return res.json({ success: true, data: sanitizeUser(user) });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async refresh(req, res) {
    try {
      const out = await authService.refresh(req.body);
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async logout(req, res) {
    try {
      const out = await authService.logout(req.body);
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },

  async deleteAccount(req, res) {
    try {
      const out = await authService.deleteAccount({ userId: req.auth.userId });
      return res.json({ success: true, data: out });
    } catch (e) {
      return handleError(res, e);
    }
  },
};