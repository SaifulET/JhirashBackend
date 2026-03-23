import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../../models/User/User.model.js";
import { AuthToken } from "../../models/Auth_token/Auth_token.model.js";
import { sendEmail } from "../../core_feature/utils/mailerSender/mailer.js";

const RefreshToken = mongoose.models.RefreshToken;

const ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  "access_secret";
const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET || "refresh_secret";
const ACCESS_EXPIRES_IN = process.env.ACCESS_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || "30d";
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);
const ADMIN_RESET_OTP_MARKER = "admin_password_reset_otp";
const ADMIN_RESET_TOKEN_MARKER = "admin_password_reset_token";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const randomOtp4 = () => String(crypto.randomInt(1000, 10000));
const randomResetToken = () => crypto.randomBytes(24).toString("hex");

const sanitizeAdminUser = (user) => {
  if (!user) return null;

  return {
    _id: user._id,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    profileImage: user.profileImage || null,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const signAccessToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });

const signRefreshToken = (user, tokenId) =>
  jwt.sign({ sub: String(user._id), tid: String(tokenId) }, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });

const verifyRefreshToken = (token) => jwt.verify(token, REFRESH_TOKEN_SECRET);

const createToken = async ({
  userId,
  type,
  tokenPlain,
  expiresInMinutes,
  meta = {},
}) => {
  const tokenHash = sha256(tokenPlain);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await AuthToken.create({
    userId,
    type,
    tokenHash,
    expiresAt,
    meta,
  });
};

const consumeToken = async ({ userId, type, tokenPlain, metaUserAgent }) => {
  const tokenHash = sha256(tokenPlain);
  const now = new Date();

  const token = await AuthToken.findOneAndUpdate(
    {
      userId,
      type,
      tokenHash,
      ...(metaUserAgent ? { "meta.userAgent": metaUserAgent } : {}),
      expiresAt: { $gt: now },
      consumedAt: { $exists: false },
    },
    {
      $set: { consumedAt: now },
    },
    { new: true }
  );

  return Boolean(token);
};

const issueTokens = async (user) => {
  const accessToken = signAccessToken(user);

  if (RefreshToken) {
    const session = await RefreshToken.create({ userId: user._id });
    return {
      accessToken,
      refreshToken: signRefreshToken(user, session._id),
    };
  }

  return {
    accessToken,
    refreshToken: jwt.sign({ sub: String(user._id) }, REFRESH_TOKEN_SECRET, {
      expiresIn: REFRESH_EXPIRES_IN,
    }),
  };
};

const ensureAdminByEmail = async (email) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw { status: 400, message: "email is required" };
  }

  const user = await User.findOne({
    email: normalizedEmail,
    role: "admin",
    isDeleted: { $ne: true },
  });

  if (!user) {
    throw { status: 404, message: "Admin account not found" };
  }

  return user;
};

const ensureAdminById = async (userId) => {
  const user = await User.findById(userId);

  if (!user || user.isDeleted) {
    throw { status: 404, message: "Admin account not found" };
  }

  if (user.role !== "admin") {
    throw { status: 403, message: "Only admin can access this resource" };
  }

  return user;
};

const assertStrongPassword = (password, fieldName = "newPassword") => {
  if (!password) {
    throw { status: 400, message: `${fieldName} is required` };
  }

  if (String(password).length < 6) {
    throw { status: 400, message: `${fieldName} must be at least 6 characters` };
  }
};

const sendAdminResetCodeEmail = async ({ email, otp, adminName }) => {
  await sendEmail({
    to: email,
    subject: "Admin Password Reset Code",
    text: `Hello ${adminName || "Admin"},\n\nYour admin password reset code is: ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes.`,
    html: `<div style="font-family: Arial, sans-serif; color: #222;">
      <h2 style="margin-bottom: 8px;">Admin Password Reset</h2>
      <p>Hello ${adminName || "Admin"},</p>
      <p>Use this verification code to reset your admin password:</p>
      <div style="margin: 16px 0; padding: 14px; background: #f5f5f5; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 8px;">
        ${otp}
      </div>
      <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
      <p style="font-size: 12px; color: #666;">If you did not request this, you can ignore this email.</p>
    </div>`,
  });
};

export const adminAuthService = {
  async signin({ email, password }) {
    if (!password) {
      throw { status: 400, message: "password is required" };
    }

    const admin = await ensureAdminByEmail(email);

    if (admin.status !== "active") {
      throw { status: 403, message: "Admin account is not active" };
    }

    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash || "");
    if (!isPasswordValid) {
      throw { status: 401, message: "Invalid email or password" };
    }

    const tokens = await issueTokens(admin);

    return {
      admin: sanitizeAdminUser(admin),
      ...tokens,
    };
  },

  async forgotPassword({ email }) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      throw { status: 400, message: "email is required" };
    }

    const admin = await User.findOne({
      email: normalizedEmail,
      role: "admin",
      isDeleted: { $ne: true },
    });

    if (!admin) {
      return { message: "If the admin account exists, a verification code has been sent" };
    }

    const otp = randomOtp4();

    await createToken({
      userId: admin._id,
      type: "email_otp",
      tokenPlain: otp,
      expiresInMinutes: OTP_TTL_MINUTES,
      meta: { userAgent: ADMIN_RESET_OTP_MARKER },
    });

    await sendAdminResetCodeEmail({
      email: admin.email,
      otp,
      adminName: admin.name,
    });

    return { message: "If the admin account exists, a verification code has been sent" };
  },

  async verifyCode({ email, code, otp }) {
    const tokenValue = String(code || otp || "").trim();
    if (!tokenValue) {
      throw { status: 400, message: "code is required" };
    }

    const admin = await ensureAdminByEmail(email);
    const isValid = await consumeToken({
      userId: admin._id,
      type: "email_otp",
      tokenPlain: tokenValue,
      metaUserAgent: ADMIN_RESET_OTP_MARKER,
    });

    if (!isValid) {
      throw { status: 400, message: "Invalid or expired verification code" };
    }

    const resetToken = randomResetToken();

    await createToken({
      userId: admin._id,
      type: "password_reset",
      tokenPlain: resetToken,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      meta: { userAgent: ADMIN_RESET_TOKEN_MARKER },
    });

    return {
      message: "Code verified successfully",
      resetToken,
    };
  },

  async setNewPassword({ resetToken, newPassword, confirmPassword }) {
    if (!resetToken) {
      throw { status: 400, message: "resetToken is required" };
    }

    assertStrongPassword(newPassword);

    if (newPassword !== confirmPassword) {
      throw { status: 400, message: "newPassword and confirmPassword do not match" };
    }

    const tokenHash = sha256(resetToken);
    const tokenDoc = await AuthToken.findOne({
      type: "password_reset",
      tokenHash,
      "meta.userAgent": ADMIN_RESET_TOKEN_MARKER,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      throw { status: 400, message: "Invalid or expired reset token" };
    }

    const admin = await ensureAdminById(tokenDoc.userId);
    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await admin.save();

    tokenDoc.consumedAt = new Date();
    await tokenDoc.save();

    if (RefreshToken) {
      await RefreshToken.updateMany(
        { userId: admin._id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
      );
    }

    return { message: "Password reset successfully" };
  },

  async changePassword({ adminUserId, currentPassword, newPassword, confirmPassword }) {
    if (!currentPassword) {
      throw { status: 400, message: "currentPassword is required" };
    }

    assertStrongPassword(newPassword);

    if (newPassword !== confirmPassword) {
      throw { status: 400, message: "newPassword and confirmPassword do not match" };
    }

    const admin = await ensureAdminById(adminUserId);
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.passwordHash || ""
    );

    if (!isCurrentPasswordValid) {
      throw { status: 401, message: "Current password is incorrect" };
    }

    admin.passwordHash = await bcrypt.hash(newPassword, 12);
    await admin.save();

    if (RefreshToken) {
      await RefreshToken.updateMany(
        { userId: admin._id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
      );
    }

    return { message: "Password changed successfully" };
  },

  async refresh({ refreshToken }) {
    if (!refreshToken) {
      throw { status: 400, message: "refreshToken is required" };
    }

    if (RefreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      const session = await RefreshToken.findById(payload.tid);

      if (!session || session.revokedAt) {
        throw { status: 401, message: "Refresh token revoked" };
      }

      const admin = await ensureAdminById(payload.sub);
      if (admin.status !== "active") {
        throw { status: 403, message: "Admin account is not active" };
      }

      return { accessToken: signAccessToken(admin) };
    }

    const payload = verifyRefreshToken(refreshToken);
    const admin = await ensureAdminById(payload.sub);

    if (admin.status !== "active") {
      throw { status: 403, message: "Admin account is not active" };
    }

    return { accessToken: signAccessToken(admin) };
  },

  async logout({ refreshToken }) {
    if (!RefreshToken) {
      return { message: "Logged out successfully" };
    }

    if (!refreshToken) {
      return { message: "Logged out successfully" };
    }

    const payload = verifyRefreshToken(refreshToken);

    await RefreshToken.updateOne(
      {
        _id: payload.tid,
        userId: payload.sub,
        revokedAt: { $exists: false },
      },
      {
        $set: { revokedAt: new Date() },
      }
    );

    return { message: "Logged out successfully" };
  },
};
