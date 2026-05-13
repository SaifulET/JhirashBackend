// src/modules/driver-onboarding/driverOnboarding.service.js

import { User } from "../../models/User/User.model.js";
import { DriverProfile } from "../../models/Driver_profile/Driver_profile.model.js";
import { Vehicle } from "../../models/Vehicle/Vehicle.model.js";
import { DriverDocument } from "../../models/Driver_documents/Driver_documents.model.js";
import { assertStripeConfigured } from "../../core_feature/utils/stripe/stripe.js";

export const REQUIRED_DRIVER_DOCUMENT_TYPES = [
  "profile_photo",
  "driver_license_front",
  "driver_license_back",
  "vehicle_insurance",
  "vehicle_registration",
];

const REQUIRED_DRIVER_DOCUMENT_GROUPS = [
  {
    key: "profile_photo",
    types: ["profile_photo"],
    isPresenceOnly: true,
  },
  {
    key: "driver_license",
    types: ["driver_license_front", "driver_license_back"],
  },
  {
    key: "vehicle_information",
    types: [],
    isVehicle: true,
  },
  {
    key: "vehicle_insurance",
    types: ["vehicle_insurance"],
  },
  {
    key: "vehicle_registration",
    types: ["vehicle_registration"],
  },
  {
    key: "payment_information",
    types: [],
    isStripe: true,
  },
];

export const normalizeReviewStatus = (status) => {
  if (status === "completed") return "approved";
  if (status === "complete") return "approved";
  if (status === "need_attention") return "rejected";
  if (status === "submitted") return "in_review";
  return status || "missing";
};

const mapClientReviewStatus = (status) => {
  const normalizedStatus = normalizeReviewStatus(status);

  if (normalizedStatus === "approved") return "completed";
  if (normalizedStatus === "in_review") return "in_review";
  return "need_attention";
};

export const getVehicleReviewStatus = (vehicle) => {
  if (!vehicle) {
    return "missing";
  }

  if (vehicle.approved) {
    return "approved";
  }

  const normalizedReviewStatus = normalizeReviewStatus(vehicle.reviewStatus);
  if (normalizedReviewStatus !== "missing") {
    return normalizedReviewStatus;
  }

  return "in_review";
};

const getCombinedDocumentStatus = (statuses = []) => {
  const normalizedStatuses = statuses.map((status) => normalizeReviewStatus(status));

  if (normalizedStatuses.length === 0 || normalizedStatuses.includes("missing")) {
    return "missing";
  }

  if (normalizedStatuses.includes("rejected")) {
    return "rejected";
  }

  if (normalizedStatuses.every((status) => status === "approved")) {
    return "approved";
  }

  if (normalizedStatuses.includes("in_review") || normalizedStatuses.includes("approved")) {
    return "in_review";
  }

  return "missing";
};

const getPresenceOnlyStatus = (value) => (value ? "approved" : "missing");

const getDefaultSeatsForVehicleType = (vehicleType = "car") => {
  if (vehicleType === "suv") {
    return 5;
  }

  if (vehicleType === "van") {
    return 7;
  }

  return 4;
};

const getSizeFromVehiclePreference = ({ vehicleType = "car", seats } = {}) => {
  if (vehicleType === "car") {
    return "normal";
  }

  return Number(seats || 0) <= 5 ? "compact" : "full";
};

const normalizeVehiclePayload = (payload = {}) => {
  const brand = String(payload.brand || "").trim();
  const model = String(payload.model || "").trim();
  const type = String(payload.type || "").trim().toLowerCase();
  const tier = String(payload.tier || "regular").trim().toLowerCase();
  const licensePlate = String(payload.licensePlate || "").trim();

  const parsedYear = Number(payload.year);
  const year = Number.isInteger(parsedYear) ? parsedYear : undefined;

  const parsedSeats = Number(payload.seats);
  const seats =
    Number.isFinite(parsedSeats) && parsedSeats > 0
      ? parsedSeats
      : getDefaultSeatsForVehicleType(type || "car");

  if (!brand || !model || !type || !licensePlate) {
    throw {
      status: 400,
      message: "brand, model, type and licensePlate are required",
    };
  }

  return {
    brand,
    model,
    year,
    type,
    tier,
    seats,
    licensePlate,
    size: getSizeFromVehiclePreference({ vehicleType: type, seats }),
  };
};

const getDriverUser = async (userId) => {
  const user = await User.findById(userId)
    .select("_id role isDeleted email name")
    .lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (user.role !== "driver") {
    throw { status: 403, message: "Only drivers can access onboarding" };
  }

  return user;
};

const getApiUrl = () => {
  const fallbackUrl = `http://localhost:${process.env.PORT || 5001}`;
  return String(process.env.API_URL || fallbackUrl).trim().replace(/\/+$/, "");
};

const getStripeReturnUrl = (payload = {}) => {
  const returnUrl = String(payload.returnUrl || "").trim();

  if (!returnUrl) {
    throw {
      status: 400,
      message: "returnUrl is required",
    };
  }

  return returnUrl;
};

const buildStripeConnectRedirectUrl = (path, returnUrl) => {
  return `${getApiUrl()}${path}?redirect=${encodeURIComponent(returnUrl)}`;
};

const isStripeAccountReady = (account) => {
  return Boolean(account?.details_submitted && account?.charges_enabled && account?.payouts_enabled);
};

const isMissingOrInaccessibleStripeAccountError = (error) => {
  return (
    error?.statusCode === 404 ||
    error?.raw?.code === "resource_missing" ||
    error?.raw?.code === "account_invalid" ||
    String(error?.message || "").includes("does not have access to account")
  );
};

const getOrCreateDriverProfile = async (userId) => {
  return DriverProfile.findOneAndUpdate(
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
  );
};

const upsertDocument = async ({ driverId, type, fileUrl }) => {
  const document = await DriverDocument.findOneAndUpdate(
    { driverId, type },
    {
      $set: {
        fileUrl,
        status: "submitted",
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
  );

  return document;
};

const buildStepStatus = ({ vehicle, documents, stripeConnected }) => {
  const docMap = Object.fromEntries(
    documents.map((document) => [document.type, normalizeReviewStatus(document.status)])
  );

  const getDocStatus = (type) => mapClientReviewStatus(docMap[type]);
  const getPresenceOnlyStepStatus = (type) =>
    mapClientReviewStatus(getPresenceOnlyStatus(Boolean(docMap[type])));
  const getLicenseStatus = () =>
    mapClientReviewStatus(
      getCombinedDocumentStatus([
        docMap.driver_license_front || "missing",
        docMap.driver_license_back || "missing",
      ])
    );
  const getSimpleStatus = (value) => (value ? "completed" : "need_attention");

  return [
    {
      key: "vehicle",
      title: "Vehicle Information",
      status: mapClientReviewStatus(getVehicleReviewStatus(vehicle)),
    },
    {
      key: "profile_photo",
      title: "Profile Photo",
      status: getPresenceOnlyStepStatus("profile_photo"),
    },
    {
      key: "driver_license_front",
      title: "Driver License",
      status: getLicenseStatus(),
    },
    {
      key: "vehicle_registration",
      title: "Vehicle Registration",
      status: getDocStatus("vehicle_registration"),
    },
    {
      key: "vehicle_insurance",
      title: "Vehicle Insurance",
      status: getDocStatus("vehicle_insurance"),
    },
    {
      key: "stripe",
      title: "Stripe Connection",
      status: getSimpleStatus(stripeConnected),
    },
  ];
};

const getRequiredReviewItems = async (userId) => {
  const [documents, vehicle, driverProfile] = await Promise.all([
    DriverDocument.find(
      { driverId: userId, type: { $in: REQUIRED_DRIVER_DOCUMENT_TYPES } },
      { type: 1, status: 1, _id: 0 }
    ).lean(),
    Vehicle.findOne({ driverId: userId, isActive: true }, { approved: 1, reviewStatus: 1 }).lean(),
    DriverProfile.findOne({ userId }, { stripeConnected: 1 }).lean(),
  ]);

  const documentStatusByType = new Map(
    documents.map((document) => [document.type, normalizeReviewStatus(document.status)])
  );

  const requiredItems = REQUIRED_DRIVER_DOCUMENT_GROUPS.map((group) => {
    if (group.isVehicle) {
      return {
        key: group.key,
        status: getVehicleReviewStatus(vehicle),
      };
    }

    if (group.isStripe) {
      return {
        key: group.key,
        status: getPresenceOnlyStatus(Boolean(driverProfile?.stripeConnected)),
      };
    }

    if (group.isPresenceOnly) {
      return {
        key: group.key,
        status: getPresenceOnlyStatus(Boolean(documentStatusByType.get(group.key))),
      };
    }

    return {
      key: group.key,
      status: getCombinedDocumentStatus(
        group.types.map((type) => documentStatusByType.get(type) || "missing")
      ),
    };
  });

  return requiredItems;
};

export const syncDriverDocumentSummary = async (userId) => {
  const requiredItems = await getRequiredReviewItems(userId);
  const statuses = requiredItems.map((item) => item.status);
  const hasRejected = statuses.includes("rejected");
  const hasApproved = statuses.includes("approved");
  const hasInReview = statuses.includes("in_review");
  const allApproved = statuses.every((status) => status === "approved");

  let documentsStatus = "pending";

  if (hasRejected) {
    documentsStatus = "denied";
  } else if (allApproved) {
    documentsStatus = "verified";
  } else if (hasInReview || hasApproved) {
    documentsStatus = "in_review";
  }

  const requiredActionsCount = requiredItems.filter((item) => item.status !== "approved").length;

  return DriverProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        documentsStatus,
        requiredActionsCount,
      },
      $setOnInsert: {
        userId,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

export const driverOnboardingService = {
async  getStatus(userId) {
  const userPromise = User.findById(userId)
    .select("role isDeleted")
    .lean();

  const driverProfilePromise = DriverProfile.findOne({ userId })
    .select("stripeConnected")
    .lean();
    

  const vehiclePromise = Vehicle.findOne({ driverId: userId, isActive: true })
    .select("_id approved reviewStatus")
    .lean();

  const documentsPromise = DriverDocument.find(
    { driverId: userId },
    {
      type: 1,
      status: 1,
      _id: 0,
    }
  ).lean();

  const [user, driverProfile, vehicle, documents] = await Promise.all([
    userPromise,
    driverProfilePromise,
    vehiclePromise,
    documentsPromise,
  ]);

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (user.role !== "driver") {
    throw { status: 403, message: "Only drivers can access onboarding" };
  }

  const steps = buildStepStatus({
    vehicle,
    documents,
    stripeConnected: !!driverProfile?.stripeConnected,
    user,
  });
  await syncDriverDocumentSummary(userId);

  return steps;
    // .filter(
    //   (step) =>
    //     step.key !== "basic_profile" &&
    //     step.key !== "driver_license_back"
    // )
    // .map((step) => ({
    //   key: step.key,
    //   title: step.title,
    //   status:
    //     step.key === "vehicle" || step.key === "stripe"
    //       ? step.completed
    //         ? ""
    //         : "need_attention"
    //       : step.status || (step.completed ? "completed" : "need_attention"),
    // }));
},

 async saveVehicle (userId, payload) {
  await getDriverUser(userId);

  const {
    brand,
    model,
    year,
    type,
    tier,
    seats,
    licensePlate,
    size,
  } = normalizeVehiclePayload(payload);

  const vehicle = await Vehicle.findOneAndUpdate(
    { driverId: userId, isActive: true },
    {
      $set: {
        brand,
        model,
        year,
        type,
        tier,
        size,
        seats,
        licensePlate,
        isActive: true,
        approved: false,
        reviewStatus: "submitted",
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
      $setOnInsert: {
        driverId: userId,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  );

  await DriverProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        activeVehicleId: vehicle._id,
      },
      $setOnInsert: {
        userId,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  await syncDriverDocumentSummary(userId);

  return {
    message: "Vehicle information saved successfully",
    vehicle,
  };
},
 
  

  async uploadProfilePhoto(userId, fileUrl) {
     await getDriverUser(userId);

  const [document] = await Promise.all([
    upsertDocument({
      driverId: userId,
      type: "profile_photo",
       fileUrl,
    }),
    User.updateOne(
      { _id: userId },
      { $set: { profileImage: fileUrl } }
    ),
  ]);

  await syncDriverDocumentSummary(userId);

  return {
    message: "Profile photo uploaded successfully",
    document,
  };
  },

  async uploadLicenseFront(userId, fileUrl) {
    await getDriverUser(userId);

  const document = await upsertDocument({
    driverId: userId,
    type: "driver_license_front",
    fileUrl,
  });

  // update summary after upload
  await syncDriverDocumentSummary(userId);

  return {
    message: "Driver license front uploaded successfully",
    document,
  };
  },

 async uploadLicenseBack(userId, fileUrl) {
  await getDriverUser(userId);

  const document = await upsertDocument({
    driverId: userId,
    type: "driver_license_back",
    fileUrl,
  });

  await syncDriverDocumentSummary(userId);

  return {
    message: "Driver license back uploaded successfully",
    document,
  };
},

 async uploadVehicleRegistration(userId, fileUrl) {
  await getDriverUser(userId);

  const document = await upsertDocument({
    driverId: userId,
    type: "vehicle_registration",
    fileUrl,
  });

  await syncDriverDocumentSummary(userId);

  return {
    message: "Vehicle registration uploaded successfully",
    document,
  };
},

 async uploadVehicleInsurance(userId, fileUrl) {
  await getDriverUser(userId);

  const document = await upsertDocument({
    driverId: userId,
    type: "vehicle_insurance",
    fileUrl,
  });

  await syncDriverDocumentSummary(userId);

  return {
    message: "Vehicle insurance uploaded successfully",
    document,
  };
},

  async createStripeOnboardingLink(userId, payload = {}) {
  const driver = await getDriverUser(userId);
  const returnUrl = getStripeReturnUrl(payload);
  const stripeClient = assertStripeConfigured();
  const driverProfile = await getOrCreateDriverProfile(userId);

  let stripeAccountId = driverProfile.stripeAccountId;
  let account = null;

  if (stripeAccountId && !String(stripeAccountId).startsWith("acct_")) {
    stripeAccountId = null;
    driverProfile.stripeAccountId = null;
    driverProfile.stripeConnected = false;
    await driverProfile.save();
  }

  if (stripeAccountId) {
    try {
      account = await stripeClient.accounts.retrieve(stripeAccountId);
    } catch (error) {
      if (!isMissingOrInaccessibleStripeAccountError(error)) {
        throw error;
      }

      stripeAccountId = null;
      driverProfile.stripeAccountId = null;
      driverProfile.stripeConnected = false;
      await driverProfile.save();
    }
  }

  if (!stripeAccountId) {
    account = await stripeClient.accounts.create({
      type: "express",
      country: process.env.STRIPE_CONNECT_COUNTRY || "US",
      business_type: "individual",
      email: driver.email || undefined,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: {
        driverUserId: String(userId),
      },
    });

    stripeAccountId = account.id;
    driverProfile.stripeAccountId = stripeAccountId;
    driverProfile.stripeConnected = false;
    await driverProfile.save();
  }

  if (isStripeAccountReady(account)) {
    const loginLink = await stripeClient.accounts.createLoginLink(stripeAccountId);

    if (!driverProfile.stripeConnected) {
      driverProfile.stripeConnected = true;
      await driverProfile.save();
    }

    return {
      url: loginLink.url,
      mode: "dashboard",
      returnUrl,
      stripeAccountId,
    };
  }

  const accountLink = await stripeClient.accountLinks.create({
    account: stripeAccountId,
    refresh_url: buildStripeConnectRedirectUrl("/stripe/connect/refresh", returnUrl),
    return_url: buildStripeConnectRedirectUrl("/stripe/connect/return", returnUrl),
    type: "account_onboarding",
  });

  return {
    url: accountLink.url,
    mode: "onboarding",
    returnUrl,
    stripeAccountId,
  };
},

  async connectStripe(userId, payload) {
  await getDriverUser(userId);

  const driverProfile = await DriverProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        stripeAccountId: payload.stripeAccountId,
        stripeConnected: true,
      },
      $setOnInsert: { userId },
    },
    {
      new: true,
      upsert: true,
    }
  );

  return {
    message: "Stripe connected successfully",
    stripeAccountId: driverProfile.stripeAccountId,
    stripeConnected: driverProfile.stripeConnected,
  };
},

  async review(userId) {
    const user = await getDriverUser(userId);
    const driverProfile = await getOrCreateDriverProfile(userId);
    const vehicle = await Vehicle.findOne({ driverId: userId, isActive: true }).lean();
    const requiredItems = await getRequiredReviewItems(userId);

    const missingDocuments = requiredItems
      .filter((item) => item.status === "missing")
      .map((item) => item.key);
    const rejectedDocuments = requiredItems
      .filter((item) => item.status === "rejected")
      .map((item) => item.key);
    const pendingDocuments = requiredItems
      .filter((item) => item.status === "in_review")
      .map((item) => item.key);

    const issues = [];

    if (!user.name || (!user.email && !user.phone)) {
      issues.push("Basic profile is incomplete");
    }

    if (!driverProfile.stripeConnected) {
      issues.push("Stripe account is not connected");
    }

    if (missingDocuments.length > 0) {
      issues.push("Some required documents are missing");
    }

    if (rejectedDocuments.length > 0) {
      issues.push("Some documents were rejected");
    }

    const vehicleStatus = getVehicleReviewStatus(vehicle);
    if (vehicleStatus === "missing") {
      issues.push("Vehicle information is missing");
    } else if (vehicleStatus === "rejected") {
      issues.push("Vehicle information needs attention");
    }

    const syncedProfile = await syncDriverDocumentSummary(userId);
    const eligible =
      Boolean(vehicle) &&
      driverProfile.stripeConnected &&
      syncedProfile.documentsStatus === "verified";

    return {
      eligible,
      issues,
      missingDocuments,
      rejectedDocuments,
      pendingDocuments,
      driverStatus: syncedProfile.status,
      documentsStatus: syncedProfile.documentsStatus,
      requiredActionsCount: syncedProfile.requiredActionsCount,
    };
  },



  async updateStatus({ adminUserId, driverId, type, status, rejectionReason }) {
  const allowedDocStatuses = new Set([
    "in_review",
    "approved",
    "rejected",
    "complete",
    "completed",
    "need_attention",
  ]);

  if (!allowedDocStatuses.has(status)) {
    throw { status: 400, message: "Invalid status value" };
  }

  const nextStatus = normalizeReviewStatus(status);

  const document = await DriverDocument.findOneAndUpdate(
    { driverId, type },
    {
      $set: {
        status: nextStatus,
        rejectionReason: nextStatus === "rejected" ? rejectionReason || null : null,
        reviewedBy: adminUserId,
        reviewedAt: new Date()
      }
    },
    { new: true }
  ).lean();

  if (!document) {
    throw { status: 404, message: "Document not found" };
  }

  const driverProfile = await syncDriverDocumentSummary(driverId);

  return {
    document,
    status: nextStatus,
    driverProfile: {
      documentsStatus: driverProfile.documentsStatus,
      requiredActionsCount: driverProfile.requiredActionsCount,
    },
  };
}
};
