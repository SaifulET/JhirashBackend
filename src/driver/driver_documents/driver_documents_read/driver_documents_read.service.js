// src/modules/driver-onboarding-read/driverOnboardingRead.service.js

import { User } from "../../../models/User/User.model.js";
import { DriverProfile } from "../../../models/Driver_profile/Driver_profile.model.js";
import { Vehicle } from "../../../models/Vehicle/Vehicle.model.js";
import { DriverDocument } from "../../../models/Driver_documents/Driver_documents.model.js";
import {
  getVehicleReviewStatus,
  normalizeReviewStatus,
  syncDriverDocumentSummary,
} from "../driver_documents.service.js";

const validateDriver = async (userId) => {
  const user = await User.findById(userId)
    .select("role isDeleted profileImage")
    .lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (user.role !== "driver") {
    throw { status: 403, message: "Only driver can access this resource" };
  }

  return user;
};

const mapDocument = (doc) => {
  if (!doc) {
    return null;
  }

  const normalizedStatus = normalizeReviewStatus(doc.status);
  const status = normalizedStatus === "approved"
    ? "completed"
    : normalizedStatus === "in_review"
      ? "in_review"
      : "need_attention";

  return {
    _id: doc._id,
    type: doc.type,
    fileUrl: doc.fileUrl,
    status,
    rawStatus: doc.status,
    rejectionReason: doc.rejectionReason || null,
    reviewedAt: doc.reviewedAt || null,
  };
};

const mapClientStatus = (status) =>
  status === "approved" ? "completed" : status === "in_review" ? "in_review" : "need_attention";

export const driverOnboardingReadService = {
async getSummary(userId) {
  await validateDriver(userId);

  const [driverProfile, vehicle] = await Promise.all([
    syncDriverDocumentSummary(userId),
    Vehicle.findOne({ driverId: userId, isActive: true })
      .select("_id brand model year type size seats licensePlate approved reviewStatus isActive")
      .lean(),
  ]);

  if (!driverProfile) {
    throw { status: 404, message: "Driver profile not found" };
  }

  return {
    requiredActionsCount: Number(driverProfile.requiredActionsCount || 0),
    documentsStatus: driverProfile.documentsStatus || "pending",
    vehicleStatus: mapClientStatus(getVehicleReviewStatus(vehicle)),
  };
},

  async getProfileImage(userId) {
    const user = await validateDriver(userId);

    return {
      profileImage: user.profileImage || null,
    };
  },

  async getLicensePhotos(userId) {
    await validateDriver(userId);

    const [front, back] = await Promise.all([
      DriverDocument.findOne(
        { driverId: userId, type: "driver_license_front" },
        { fileUrl: 1, status: 1, rejectionReason: 1 }
      ).lean(),

      DriverDocument.findOne(
        { driverId: userId, type: "driver_license_back" },
        { fileUrl: 1, status: 1, rejectionReason: 1 }
      ).lean(),
    ]);

    return {
      front: mapDocument(front),
      back: mapDocument(back),
    };
  },

  async getVehicleRegistration(userId) {
    await validateDriver(userId);

    const registration = await DriverDocument.findOne(
      { driverId: userId, type: "vehicle_registration" },
      { fileUrl: 1, status: 1, rejectionReason: 1 }
    ).lean();

    return {
      vehicleRegistration: mapDocument(registration),
    };
  },

  async getInsurance(userId) {
    await validateDriver(userId);

    const insurance = await DriverDocument.findOne(
      { driverId: userId, type: "vehicle_insurance" },
      { fileUrl: 1, status: 1, rejectionReason: 1 }
    ).lean();

    return {
      vehicleInsurance: mapDocument(insurance),
    };
  },

  async getStripeId(userId) {
    await validateDriver(userId);

    const driverProfile = await DriverProfile.findOne(
      { userId },
      { stripeAccountId: 1, stripeConnected: 1 }
    ).lean();

    if (!driverProfile) {
      throw { status: 404, message: "Driver profile not found" };
    }

    return {
      stripeAccountId: driverProfile.stripeAccountId || null,
      stripeConnected: driverProfile.stripeConnected || false,
    };
  },

  async getVehicleInfo(userId) {
    await validateDriver(userId);

    const vehicle = await Vehicle.findOne(
      { driverId: userId, isActive: true },
      {
        brand: 1,
        model: 1,
        year: 1,
        type: 1,
        tier: 1,
        priceRange: 1,
        size: 1,
        seats: 1,
        licensePlate: 1,
        approved: 1,
        reviewStatus: 1,
        rejectionReason: 1,
        reviewedAt: 1,
        isActive: 1,
      }
    ).lean();

    return {
      vehicle: vehicle
        ? {
            ...vehicle,
            status: mapClientStatus(getVehicleReviewStatus(vehicle)),
          }
        : null,
    };
  },
};
