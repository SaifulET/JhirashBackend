import mongoose from "mongoose";
import { softDeleteFields } from "../Helpers/Helpers.model.js";
const { Schema, model, Types } = mongoose;


const UserSchema = new Schema(
  {
    role: { type: String, enum: ["rider", "driver", "admin"], required: true, index: true },

    name: { type: String, trim: true, required: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },

    passwordHash: { type: String }, // email/password
    googleId: { type: String }, // google sub

    emailVerifiedAt: { type: Date },
    phoneVerifiedAt: { type: Date },

    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },

    // denormalized for fast lists
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    accusedCount: { type: Number, default: 0 },

    ...softDeleteFields,
  },
  { timestamps: true, versionKey: false }
);

// Efficient unique with null-allowed (partial unique)
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);
UserSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);
UserSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: "string" } } }
);

export const User = model("User", UserSchema);
