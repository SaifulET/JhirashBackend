// src/modules/driver-onboarding/driverOnboarding.service.js

import { User } from "../../models/User/User.model.js";
import { DriverProfile } from "../../models/Driver_profile/Driver_profile.model.js";
import { Vehicle } from "../../models/Vehicle/Vehicle.model.js";
import { DriverDocument } from "../../models/Driver_documents/Driver_documents.model.js";

const REQUIRED_DOCUMENT_TYPES = [
  "profile_photo",
  "driver_license_front",
  "driver_license_back",
  "vehicle_insurance",
  "vehicle_registration",
];

const getDriverUser = async (userId) => {
  const user = await User.findById(userId)
    .select("_id role isDeleted")
    .lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "User not found" };
  }

  if (user.role !== "driver") {
    throw { status: 403, message: "Only drivers can access onboarding" };
  }

  return user;
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
  const docMap = Object.fromEntries(documents.map(d => [d.type, d.status]));

  const getDocStatus = (type) => {
    const status = docMap[type];

    if (status === "approved") return "completed";
    if (status === "submitted") return "inreview";
    return "need_attention";
  };

  const getSimpleStatus = (value) => {
    return value ? "completed" : "need_attention";
  };

  return [
    {
      key: "vehicle",
      title: "Vehicle Information",
      status: getSimpleStatus(vehicle),
    },
    {
      key: "profile_photo",
      title: "Profile Photo",
      status: getDocStatus("profile_photo"),
    },
    {
      key: "driver_license_front",
      title: "Driver License Front",
      status: getDocStatus("driver_license_front"),
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

const updateDriverProfileSummary = async (userId) => {
  const docs = await DriverDocument.find(
    { driverId: userId },
    { type: 1, status: 1, _id: 0 }
  ).lean();

  let hasRejected = false;
  let hasInReview = false;

  let missingDocsCount = 0;
  let rejectedDocsCount = 0;
  let pendingDocsCount = 0;

  const approvedTypes = new Set();
  const existingTypes = new Set();

  for (const doc of docs) {
    existingTypes.add(doc.type);

    if (doc.status === "approved") {
      approvedTypes.add(doc.type);
    } else if (doc.status === "rejected") {
      hasRejected = true;
      rejectedDocsCount++;
    } else if (doc.status === "submitted" || doc.status === "in_review") {
      hasInReview = true;
      pendingDocsCount++;
    }
  }

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    if (!existingTypes.has(type)) {
      missingDocsCount++;
    }
  }

  let documentsStatus = "pending";

  if (docs.length === 0) {
    documentsStatus = "pending";
  } else if (hasRejected) {
    documentsStatus = "denied";
  } else {
    const allRequiredApproved = REQUIRED_DOCUMENT_TYPES.every((type) =>
      approvedTypes.has(type)
    );

    if (allRequiredApproved) {
      documentsStatus = "verified";
    } else if (hasInReview) {
      documentsStatus = "in_review";
    }
  }

  const requiredActionsCount =
    missingDocsCount + rejectedDocsCount + pendingDocsCount;

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
    .select("_id")
    .lean();

  const documentsPromise = DriverDocument.find(
    {
      driverId: userId,
      type: { $ne: "driver_license_back" }, // skip at DB level
    },
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
  console.log(steps);

  return steps
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
    priceRange,
    size,
    seats,
    licensePlate,
  } = payload;

  const vehicle = await Vehicle.findOneAndUpdate(
    { driverId: userId, isActive: true },
    {
      $set: {
        brand,
        model,
        year,
        type,
        priceRange,
        size,
        seats,
        licensePlate,
        isActive: true,
      },
      $setOnInsert: {
        driverId: userId,
        approved: false,
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

  await updateDriverProfileSummary(userId);

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
  await updateDriverProfileSummary(userId);

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

  await updateDriverProfileSummary(userId);

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

  await updateDriverProfileSummary(userId);

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

  await updateDriverProfileSummary(userId);

  return {
    message: "Vehicle insurance uploaded successfully",
    document,
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
    const documents = await DriverDocument.find({ driverId: userId }).lean();

    const docMap = {};
    for (const doc of documents) {
      docMap[doc.type] = doc.status;
    }

    const missingDocuments = REQUIRED_DOCUMENT_TYPES.filter((type) => !docMap[type]);
    const rejectedDocuments = REQUIRED_DOCUMENT_TYPES.filter((type) => docMap[type] === "rejected");
    const pendingDocuments = REQUIRED_DOCUMENT_TYPES.filter(
      (type) => docMap[type] === "submitted" || docMap[type] === "in_review"
    );

    const issues = [];

    if (!user.name || (!user.email && !user.phone)) {
      issues.push("Basic profile is incomplete");
    }

    if (!vehicle) {
      issues.push("Vehicle information is missing");
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

    const eligible =
      Boolean(vehicle) &&
      driverProfile.stripeConnected &&
      missingDocuments.length === 0 &&
      rejectedDocuments.length === 0;

    if (eligible && pendingDocuments.length === 0) {
      driverProfile.documentsStatus = "verified";
      if (driverProfile.status === "pending") {
        driverProfile.status = "active";
      }
    } else {
      driverProfile.documentsStatus =
        rejectedDocuments.length > 0 ? "denied" : "in_review";
    }

    driverProfile.requiredActionsCount =
      issues.length + pendingDocuments.length;

    await driverProfile.save();

    return {
      eligible,
      issues,
      missingDocuments,
      rejectedDocuments,
      pendingDocuments,
      driverStatus: driverProfile.status,
      documentsStatus: driverProfile.documentsStatus,
      requiredActionsCount: driverProfile.requiredActionsCount,
    };
  },



  async updateStatus({ adminUserId, driverId, type, status, rejectionReason }) {

  const allowedDocStatuses = new Set(["in_review", "complete", "need_attention"]);

  if (!allowedDocStatuses.has(status)) {
    throw { status: 400, message: "Invalid status value" };
  }

  const document = await DriverDocument.findOneAndUpdate(
    { driverId, type },
    {
      $set: {
        status,
        rejectionReason: status === "need_attention" ? rejectionReason || null : null,
        reviewedBy: adminUserId,
        reviewedAt: new Date()
      }
    },
    { new: true }
  ).lean();

  if (!document) {
    throw { status: 404, message: "Document not found" };
  }

  await DriverProfile.updateOne(
    { userId: driverId },
    { $set: { status } },
    { upsert: true }
  );

  return {
    document,
    status
  };
}
};