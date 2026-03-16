import mongoose from "mongoose";

const { Schema, model, Types } = mongoose;

const LegalContentSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["terms-and-conditions", "privacy-policy"],
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    contentHtml: {
      type: String,
      required: true,
    },
    contentDelta: {
      type: Schema.Types.Mixed,
      default: null,
    },
    plainText: {
      type: String,
      trim: true,
      default: "",
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, versionKey: false }
);

export const LegalContent = model("LegalContent", LegalContentSchema);
