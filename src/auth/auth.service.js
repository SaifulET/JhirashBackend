// src/modules/auth/auth.service.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User/User.model.js";
import { AuthToken } from "../models/Auth_token/Auth_token.model.js";
import { DriverProfile } from "../models/Driver_profile/Driver_profile.model.js";
import { DriverDocument } from "../models/Driver_documents/Driver_documents.model.js";
import { sendEmail } from "../core_feature/utils/mailerSender/mailer.js";
import { syncDriverDocumentSummary } from "../driver/driver_documents/driver_documents.service.js";

const RefreshToken = mongoose.models.RefreshToken; // optional

const JWT_ACCESS_SECRET =
  process.env.ACCESS_TOKEN_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  "access_secret";
const JWT_REFRESH_SECRET =
  process.env.REFRESH_TOKEN_SECRET || process.env.JWT_REFRESH_SECRET || "refresh_secret";
const ACCESS_EXPIRES_IN = process.env.ACCESS_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || "30d";
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomOtp4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function sendOtpEmail({ email, otp, name, purpose = "email_verification" }) {
  const isPasswordReset = purpose === "password_reset";
  const safeName = String(name || "").trim();
  const greetingName = safeName || "there";
  const subject = isPasswordReset ? "Password Reset Code" : "Email Verification Code";
  const actionText = isPasswordReset ? "reset your password" : "verify your email";
  const codeLabel = isPasswordReset ? "password reset" : "email verification";

  await sendEmail({
    to: email,
    subject,
    text: `Hello ${greetingName},\n\nYour ${codeLabel} code is: ${otp}\n\nEnter this code to ${actionText}. The code expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you didn't request this, please ignore this email.`,
    html: `<div style="font-family: Arial, sans-serif; color: #222;">
      <h3 style="margin-bottom: 8px;">${isPasswordReset ? "Password Reset" : "Verify Email"}</h3>
      <p>Hello ${greetingName},</p>
      <p>Use this verification code to ${actionText}:</p>
      <div style="background: #f5f5f5; padding: 15px; margin: 15px 0; font-size: 28px; font-weight: bold; text-align: center; letter-spacing: 8px;">
        ${otp}
      </div>
      <p>This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.</p>
      <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
    </div>`,
  });
}

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });
}

function signRefreshToken(user, tokenId) {
  return jwt.sign({ sub: String(user._id), tid: String(tokenId) }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

async function createToken({ userId, type, tokenPlain, meta = {}, expiresInMinutes = OTP_TTL_MINUTES }) {
  const tokenHash = sha256(tokenPlain);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
  await AuthToken.create({ userId, type, tokenHash, expiresAt, meta });
}

async function consumeToken({ userId, type, tokenPlain }) {
  const tokenHash = sha256(tokenPlain);
  const now = new Date();
  const doc = await AuthToken.findOneAndUpdate(
    { userId, type, tokenHash, expiresAt: { $gt: now }, consumedAt: { $exists: false } },
    { $set: { consumedAt: now } },
    { new: true }
  );
  return !!doc;
}

async function issueTokens(userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw { status: 404, code: "NOT_FOUND", message: "User not found" };

  const accessToken = signAccessToken(user);

  // Strong logout + multi-device support
  if (RefreshToken) {
    const session = await RefreshToken.create({ userId: user._id });
    const refreshToken = signRefreshToken(user, session._id);
    return { accessToken, refreshToken };
  }

  // Stateless refresh fallback (logout can't fully revoke)
  const refreshToken = jwt.sign({ sub: String(user._id) }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
  return { accessToken, refreshToken };
}

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw { status: 500, code: "CONFIG_ERROR", message: "GOOGLE_CLIENT_ID is not configured" };
  }

  if (!idToken) {
    throw { status: 400, code: "VALIDATION_ERROR", message: "idToken is required" };
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
  } catch {
    throw { status: 401, code: "INVALID_GOOGLE_TOKEN", message: "Invalid Google token" };
  }

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload?.email) {
    throw { status: 400, code: "INVALID_GOOGLE_PROFILE", message: "Google account is missing required fields" };
  }

  return payload;
}

export const authService = {
  async register({ name,phone, email, password }) {
    
    if (!email ) throw { status: 400, code: "VALIDATION_ERROR", message: "Email  required" };
    if (!password || password.length < 6) throw { status: 400, code: "VALIDATION_ERROR", message: "Weak password" };

    const normalizedEmail = email?.toLowerCase();

    const exists = await User.findOne({
      $or: [...(normalizedEmail ? [{ email: normalizedEmail }] : [])],
      isDeleted: { $ne: true },
    }).lean();

    if (exists) throw { status: 409, code: "CONFLICT", message: "User already exists" };

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
     
      name,
      email: normalizedEmail,
      passwordHash,
      phone,
      status: "active",
      emailVerifiedAt: null,
      isDeleted: false,
    });

    // Send verification OTP (returning for dev only)
    const otp = crypto.randomInt(1000, 9999).toString();
  user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
  await  user.save()

  // Send OTP via email
    await sendOtpEmail({
      email: user.email,
      otp,
      name: user.name,
      purpose: "email_verification",
    });

    await createToken({ userId: user._id, type: "email_otp", tokenPlain: otp, meta: { email: user.email } });

    return { user, otpForDev: otp };
  },
  async editRoleService(data)
  {
   let email= data.email;
   let role=data.role;
    if (!["rider", "driver","admin"].includes(role)) throw { status: 400, code: "VALIDATION_ERROR", message: "Invalid role" };
    
    const normalizedEmail = email?.toLowerCase();

    const user = await User.findOne({
      $or: [...(normalizedEmail ? [{ email: normalizedEmail }] : [])],
      isDeleted: { $ne: true },
    });
    if (!user) throw { status: 409, code: "CONFLICT", message: "Invalid Email" };
   
    user.role=role;
    await user.save();
    return user;
  }
  ,

  async login({ email, password }) {
    const user = await User.findOne({ email: email?.toLowerCase(), isDeleted: { $ne: true } });
    if (!user) throw { status: 401, code: "INVALID_CREDENTIALS", message: "Invalid email or password" };
    if (user.status !== "active") throw { status: 403, code: "FORBIDDEN", message: "Account not active" };

    const ok = await bcrypt.compare(password, user.passwordHash || "");
    if (!ok) throw { status: 401, code: "INVALID_CREDENTIALS", message: "Invalid email or password" };

    const { accessToken, refreshToken } = await issueTokens(user._id);
    return { user, accessToken, refreshToken };
  },

  async googleLogin({ idToken, role }) {
    const payload = await verifyGoogleIdToken(idToken);
    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    if (role && !["rider", "driver"].includes(role)) {
      throw { status: 400, code: "VALIDATION_ERROR", message: "Invalid role" };
    }
    const normalizedRole = role || undefined;

    let user = await User.findOne({
      $or: [{ googleId }, { email }],
      isDeleted: { $ne: true },
    });

    if (!user) {
      user = await User.create({
        name: payload.name || email.split("@")[0],
        email,
        googleId,
        profileImage: payload.picture,
        role: normalizedRole || "rider",
        status: "active",
        emailVerifiedAt: payload.email_verified ? new Date() : null,
        isDeleted: false,
      });
    } else {
      if (user.status !== "active") {
        throw { status: 403, code: "FORBIDDEN", message: "Account not active" };
      }

      let shouldSave = false;

      if (!user.googleId) {
        user.googleId = googleId;
        shouldSave = true;
      }

      if (!user.profileImage && payload.picture) {
        user.profileImage = payload.picture;
        shouldSave = true;
      }

      if (!user.emailVerifiedAt && payload.email_verified) {
        user.emailVerifiedAt = new Date();
        shouldSave = true;
      }

      if (!user.name && payload.name) {
        user.name = payload.name;
        shouldSave = true;
      }

      if (!user.role && normalizedRole) {
        user.role = normalizedRole;
        shouldSave = true;
      }

      if (shouldSave) {
        await user.save();
      }
    }

    const { accessToken, refreshToken } = await issueTokens(user._id);
    return { user, accessToken, refreshToken };
  },

  async sendVerificationOtp({ email }) {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail) {
      throw { status: 400, code: "VALIDATION_ERROR", message: "Email is required" };
    }

    const user = await User.findOne({ email: normalizedEmail, isDeleted: { $ne: true } });
    if (!user) throw { status: 404, code: "NOT_FOUND", message: "User not found" };

    const otp = randomOtp4();
    await sendOtpEmail({
      email: user.email,
      otp,
      name: user.name,
      purpose: "email_verification",
    });
    await createToken({ userId: user._id, type: "email_otp", tokenPlain: otp, meta: { email: user.email } });

    return { message: "Verification code sent", otpForDev: otp };
  },

 async verifyEmailOtp({ email, otp }) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !otp) {
    throw {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Email and OTP are required",
    };
  }

  const user = await User.findOne(
    {
      email: normalizedEmail,
      isDeleted: { $ne: true },
    },
    {
      _id: 1,
      name: 1,
      email: 1,
      role: 1,
      status: 1,
      profileImage: 1,
      emailVerifiedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }
  ).lean();

  if (!user) {
    throw { status: 404, code: "NOT_FOUND", message: "User not found" };
  }

  const ok = await consumeToken({
    userId: user._id,
    type: "email_otp",
    tokenPlain: otp,
  });

  if (!ok) {
    throw {
      status: 400,
      code: "INVALID_OTP",
      message: "Invalid or expired OTP",
    };
  }

  const verifiedAt = new Date();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerifiedAt: verifiedAt,
      },
      $unset: {
        otp: 1,
        otpExpiry: 1,
      },
    }
  );

  const { accessToken, refreshToken } = await issueTokens(user._id);

  return {
    message: "Email verified successfully",
    user: {
      ...user,
      emailVerifiedAt: verifiedAt,
    },
    accessToken,
    refreshToken,
  };
},

  async forgotPassword({ email }) {
    const user = await User.findOne({ email: email?.toLowerCase(), isDeleted: { $ne: true } });
    if (!user) return { message: "If account exists, reset code sent" };

    const otp = randomOtp4();
    user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 15 * 60 * 1000);
  await  user.save()

  // Send OTP via email
    await sendOtpEmail({
      email: user.email,
      otp,
      name: user.name,
      purpose: "password_reset",
    });

    await createToken({ userId: user._id, type: "password_reset", tokenPlain: otp, meta: { email: user.email } });

    return { message: "If account exists, reset code sent"};
  },

  async verifyResetOtp({ email, otp }) {
    
    const user = await User.findOne({ email: email?.toLowerCase(), isDeleted: { $ne: true } });
    if (!user) throw { status: 400, code: "INVALID_OTP", message: "Invalid or expired OTP" };
    const ok = await consumeToken({ userId: user._id, type: "password_reset", tokenPlain: otp });
    if (!ok) throw { status: 400, code: "INVALID_OTP", message: "Invalid or expired OTP" };

    // issue short-lived reset token (plain random, stored hashed with TTL)
    const resetToken = crypto.randomBytes(24).toString("hex");
    await createToken({
      userId: user._id,
      type: "password_reset",
      tokenPlain: resetToken,
      meta: { email: user.email },
      expiresInMinutes: 15,
    });

    return { resetToken };
  },

  async resetPassword({ resetToken, newPassword,confirmPassword }) {

    if (newPassword !== confirmPassword) throw { status: 400, code: "VALIDATION_ERROR", message: "new password and confirm password is not same" };
    if (!newPassword || newPassword.length < 6) throw { status: 400, code: "VALIDATION_ERROR", message: "Weak password" };

    const tokenHash = sha256(resetToken);
    const tokenDoc = await AuthToken.findOne({
      type: "password_reset",
      tokenHash,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) throw { status: 400, code: "INVALID_TOKEN", message: "Invalid or expired reset token" };

    const user = await User.findById(tokenDoc.userId);
    if (!user) throw { status: 404, code: "NOT_FOUND", message: "User not found" };

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    tokenDoc.consumedAt = new Date();
    await tokenDoc.save();

    // revoke refresh sessions
    if (RefreshToken) {
      await RefreshToken.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    }

    return { message: "Password updated" };
  },

  async changePassword({ userId, currentPassword, newPassword }) {
    const user = await User.findById(userId);
    if (!user) throw { status: 404, code: "NOT_FOUND", message: "User not found" };
    const ok = await bcrypt.compare(currentPassword, user.passwordHash || "");
    if (!ok) throw { status: 401, code: "INVALID_CREDENTIALS", message: "Current password incorrect" };

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    if (RefreshToken) {
      await RefreshToken.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    }

    return { message: "Password changed" };
  },

  async me({ userId }) {
    const user = await User.findById(userId).lean();
    if (!user || user.isDeleted) throw { status: 404, code: "NOT_FOUND", message: "User not found" };
    delete user.passwordHash;
    return user;
  },

  async refresh({ refreshToken }) {
    if (!refreshToken) throw { status: 400, code: "VALIDATION_ERROR", message: "refreshToken required" };

    // With DB sessions
    if (RefreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      const session = await RefreshToken.findById(payload.tid);
      if (!session || session.revokedAt) throw { status: 401, code: "UNAUTHORIZED", message: "Refresh token revoked" };

      const user = await User.findById(payload.sub);
      if (!user || user.status !== "active") throw { status: 403, code: "FORBIDDEN", message: "Account not active" };

      return { accessToken: signAccessToken(user) };
    }

    // Stateless
    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.sub);
    if (!user) throw { status: 401, code: "UNAUTHORIZED", message: "Invalid refresh token" };

    return { accessToken: signAccessToken(user) };
  },

  async logout({ refreshToken }) {
    if (!RefreshToken) return { message: "Logged out" };
    if (!refreshToken) return { message: "Logged out" };

    const payload = verifyRefreshToken(refreshToken);
    await RefreshToken.updateOne(
      { _id: payload.tid, userId: payload.sub, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );

    return { message: "Logged out" };
  },

  async deleteAccount({ userId }) {
    const user = await User.findById(userId);
    if (!user) throw { status: 404, code: "NOT_FOUND", message: "User not found" };

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.status = "suspended";
    await user.save();

    if (RefreshToken) {
      await RefreshToken.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    }

    return { message: "Account deleted" };
  },



  async imageSave({ userId, image }) {
    const updatedData = await User.findByIdAndUpdate(
      userId,
      { $set: { profileImage: image } },
      { new: true }
    );

    if (!updatedData) {
      throw { status: 404, message: "User not found" };
    }

    if (updatedData.role === "driver" && image) {
      await Promise.all([
        DriverDocument.findOneAndUpdate(
          { driverId: userId, type: "profile_photo" },
          {
            $set: {
              fileUrl: image,
              status: "complete",
              rejectionReason: null,
              reviewedBy: null,
              reviewedAt: null,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          }
        ),
        DriverProfile.findOneAndUpdate(
          { userId },
          {
            $setOnInsert: {
              userId,
              status: "pending",
              isOnline: false,
              isBusy: false,
              documentsStatus: "pending",
              requiredActionsCount: 0,
              stripeConnected: false,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          }
        ),
      ]);

      await syncDriverDocumentSummary(userId);
    }

    return updatedData;
  },
  async editProfile(id,updateData){
const updatedDoc = await User.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedDoc) {
    throw new Error("Document not found");
  }

  return updatedDoc;
  }
};

