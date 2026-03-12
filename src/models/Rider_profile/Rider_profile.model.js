import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;
import {PlaceSchema} from "../../models/Helpers/Helpers.model.js"
const RiderProfileSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    stripeCustomerId: { type: String },
    defaultPaymentMethodId: { type: String }, // stripe PM id (optional)
    savedPlaces: { type: [PlaceSchema], default: [] }, // small embed list
  },
  { timestamps: true, versionKey: false }
);

export const RiderProfile = model("RiderProfile", RiderProfileSchema);
