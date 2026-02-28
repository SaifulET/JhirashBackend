import mongoose from "mongoose";
const { Schema, model, Types } = mongoose;

const RatingSchema = new Schema(
  {
    tripId: { type: Types.ObjectId, ref: "Trip", required: true, index: true },
    fromUserId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    toUserId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    stars: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

RatingSchema.index({ tripId: 1, fromUserId: 1 }, { unique: true });
RatingSchema.index({ toUserId: 1, createdAt: -1 });

export const Rating = model("Rating", RatingSchema);