import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
const AuthTokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", index: true },
    type: { type: String, enum: ["email_otp", "password_reset"], required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    meta: { ip: String, userAgent: String },
  },
  { timestamps: true, versionKey: false }
);

AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL
AuthTokenSchema.index({ userId: 1, type: 1, createdAt: -1 });

export const AuthToken = model("AuthToken", AuthTokenSchema);