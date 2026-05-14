import mongoose from "mongoose";
import { softDeleteFields } from "../Helpers/Helpers.model.js";
const { Schema, model, Types } = mongoose;


const UserSchema = new Schema(
  {
    role: { type: String, enum: ["rider", "driver", "admin"], index: true },

    name: { type: String, trim: true, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    address: {
      line1: { type: String, trim: true, default: "" },
      line2: { type: String, trim: true, default: "" },
      city: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      postalCode: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, uppercase: true, default: "" },
    },
    emergency:{type:String,trim:true},
    profileImage:{type:String},
    passwordHash: { type: String }, // email/password
    googleId: { type: String }, // google sub

    emailVerifiedAt: { type: Date },
    phoneVerifiedAt: { type: Date },

    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },

    // denormalized for fast lists
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    accusedCount: { type: Number, default: 0 },
    otp: {
      type: String,
      select: false,
    },

    otpExpiry: {
      type: Date,
      select: false,
    },
    

    ...softDeleteFields,
  },
  { timestamps: true, versionKey: false }
);



export const User = model("User", UserSchema);
