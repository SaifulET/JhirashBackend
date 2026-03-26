import { User } from "../../models/User/User.model.js";
import { DriverProfile } from "../../models/Driver_profile/Driver_profile.model.js";
import { DriverDocument } from "../../models/Driver_documents/Driver_documents.model.js";
import { Vehicle } from "../../models/Vehicle/Vehicle.model.js";
import { Trip } from "../../models/Trip/Trip.model.js";
import { Rating } from "../../models/Rating/Rating.model.js";
import { Report } from "../../models/Reports/Reports.model.js";

const DELETION_TIMELINE_DAYS = 30;

const ensureAdminUser = async (userId) => {
  const user = await User.findById(userId).select("_id role isDeleted").lean();

  if (!user || user.isDeleted) {
    throw { status: 404, message: "Admin user not found" };
  }

  if (user.role !== "admin") {
    throw { status: 403, message: "Only admin can access this resource" };
  }

  return user;
};

const ensureDriverUser = async (driverId) => {
  const user = await User.findById(driverId).lean();

  if (!user) {
    throw { status: 404, message: "Driver not found" };
  }

  if (user.role !== "driver") {
    throw { status: 403, message: "Selected user is not a driver" };
  }

  return user;
};

const normalizeDocumentStatus = (status) => {
  if (status === "complete") return "approved";
  if (status === "need_attention") return "rejected";
  if (status === "submitted") return "in_review";
  return status || "missing";
};

const mapDocumentBadgeStatus = (status) => {
  const normalizedStatus = normalizeDocumentStatus(status);
  if (normalizedStatus === "approved") return "verified";
  if (normalizedStatus === "rejected") return "denied";
  if (normalizedStatus === "in_review") return "pending";
  return "pending";
};

const computeDeletionInfo = (user) => {
  const isDeleted = Boolean(user?.isDeleted);
  const deletedAt = user?.deletedAt ? new Date(user.deletedAt) : null;

  if (!isDeleted || !deletedAt) {
    return {
      isDeleted: false,
      deletedAt: null,
      timelineDays: DELETION_TIMELINE_DAYS,
      daysLeft: null,
      status: "no",
    };
  }

  const msLeft =
    deletedAt.getTime() + DELETION_TIMELINE_DAYS * 24 * 60 * 60 * 1000 - Date.now();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

  return {
    isDeleted: true,
    deletedAt,
    timelineDays: DELETION_TIMELINE_DAYS,
    daysLeft,
    status: "yes",
  };
};

const toCurrencyNumber = (value) => Number(Number(value || 0).toFixed(2));

const computeDriverEarnings = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  const sharePercent = Number(trip?.pricing?.driverSharePercent || 0);
  return toCurrencyNumber((totalFare * sharePercent) / 100);
};

const mapDriverListItem = ({ index, user, profile, reportCount }) => ({
  no: index + 1,
  _id: user._id,
  driverName: user.name,
  email: user.email || null,
  contact: user.phone || null,
  userStatus: mapDocumentBadgeStatus(profile?.documentsStatus),
  driverStatus: profile?.status || "pending",
  deletionStatus: user.isDeleted ? "yes" : "no",
  rating: Number(user.ratingAvg || 0),
  reportsCount: reportCount || 0,
  createdAt: user.createdAt,
});

const buildDocumentLookup = (documents = []) =>
  Object.fromEntries(documents.map((doc) => [doc.type, doc]));

const mapDocumentCard = ({ key, title, status, itemCount = 1 }) => ({
  key,
  title,
  status: mapDocumentBadgeStatus(status),
  rawStatus: normalizeDocumentStatus(status),
  itemCount,
});

const mapTripCard = (trip, ratingGivenToDriver = null) => ({
  _id: trip._id,
  status: trip.status,
  createdAt: trip.createdAt,
  fare: {
    currency: (trip?.pricing?.currency || "USD").toUpperCase(),
    total: Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0),
    driverGets: computeDriverEarnings(trip),
  },
  riderRating: ratingGivenToDriver
    ? {
        stars: Number(ratingGivenToDriver.stars || 0),
        comment: ratingGivenToDriver.comment || "",
      }
    : null,
});

const mapTripDetail = ({ trip, rider, vehicle, riderReview, driverReview }) => ({
  _id: trip._id,
  status: trip.status,
  createdAt: trip.createdAt,
  updatedAt: trip.updatedAt,
  fare: {
    currency: (trip?.pricing?.currency || "USD").toUpperCase(),
    estimatedFare: Number(trip?.pricing?.estimatedFare || 0),
    finalFare: Number(trip?.pricing?.finalFare || 0),
    driverGets: computeDriverEarnings(trip),
  },
  pickup: trip.pickup,
  dropoff: trip.dropoff,
  distanceMiles: Number(trip.distanceMiles || 0),
  durationMinutes: Number(trip.durationMinutes || 0),
  rider: rider
    ? {
        _id: rider._id,
        name: rider.name,
        profileImage: rider.profileImage || null,
        ratingAvg: Number(rider.ratingAvg || 0),
      }
    : null,
  vehicle: vehicle
    ? {
        _id: vehicle._id,
        brand: vehicle.brand,
        model: vehicle.model,
        licensePlate: vehicle.licensePlate || null,
      }
    : null,
  riderReview: riderReview
    ? {
        _id: riderReview._id,
        stars: Number(riderReview.stars || 0),
        comment: riderReview.comment || "",
        createdAt: riderReview.createdAt,
      }
    : null,
  driverReview: driverReview
    ? {
        _id: driverReview._id,
        stars: Number(driverReview.stars || 0),
        comment: driverReview.comment || "",
        createdAt: driverReview.createdAt,
      }
    : null,
});

const refreshDriverReviewSummary = async (driverId) => {
  const [documents, vehicle] = await Promise.all([
    DriverDocument.find({
      driverId,
      type: {
        $in: [
          "profile_photo",
          "driver_license_front",
          "driver_license_back",
          "vehicle_insurance",
          "vehicle_registration",
        ],
      },
    })
      .select("type status")
      .lean(),
    Vehicle.findOne({ driverId, isActive: true }).lean(),
  ]);

  const statusByType = new Map(
    documents.map((document) => [document.type, normalizeDocumentStatus(document.status)])
  );
  const requiredTypes = [
    "profile_photo",
    "driver_license_front",
    "driver_license_back",
    "vehicle_insurance",
    "vehicle_registration",
  ];

  const missingCount = requiredTypes.filter((type) => !statusByType.has(type)).length;
  const rejectedCount = requiredTypes.filter((type) => statusByType.get(type) === "rejected").length;
  const pendingCount = requiredTypes.filter((type) => {
    const status = statusByType.get(type);
    return status === "in_review" || !status;
  }).length;
  const vehiclePending = vehicle && vehicle.approved ? 0 : 1;

  const documentsStatus =
    rejectedCount > 0
      ? "denied"
      : missingCount === 0 && pendingCount === 0 && vehiclePending === 0
        ? "verified"
        : "in_review";

  return DriverProfile.findOneAndUpdate(
    { userId: driverId },
    {
      $set: {
        documentsStatus,
        requiredActionsCount: missingCount + rejectedCount + pendingCount + vehiclePending,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  ).lean();
};

export const driverManagementService = {
  async listDrivers(adminUserId, query = {}) {
    await ensureAdminUser(adminUserId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const search = query.search?.trim();
    const userStatus = query.userStatus?.trim().toLowerCase();
    const deletionStatus = query.deletionStatus?.trim().toLowerCase();

    const userFilter = {
      role: "driver",
    };

    if (deletionStatus === "yes") {
      userFilter.isDeleted = true;
    } else if (deletionStatus === "no") {
      userFilter.isDeleted = { $ne: true };
    }

    if (search) {
      userFilter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    if (["pending", "verified", "denied"].includes(userStatus)) {
      const documentsStatusMap = {
        pending: ["pending", "in_review"],
        verified: ["verified"],
        denied: ["denied"],
      };

      const matchingProfiles = await DriverProfile.find({
        documentsStatus: { $in: documentsStatusMap[userStatus] },
      })
        .select("userId")
        .lean();

      userFilter._id = {
        $in: matchingProfiles.map((profile) => profile.userId),
      };
    }

    const [users, total] = await Promise.all([
      User.find(userFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(userFilter),
    ]);

    const driverIds = users.map((user) => user._id);
    const [profiles, reports] = await Promise.all([
      driverIds.length
        ? DriverProfile.find({ userId: { $in: driverIds } }).lean()
        : [],
      driverIds.length
        ? Report.find({ reportedUserId: { $in: driverIds } })
            .select("reportedUserId")
            .lean()
        : [],
    ]);

    const profileByUserId = new Map(profiles.map((profile) => [String(profile.userId), profile]));
    const reportCountByUserId = new Map();

    for (const report of reports) {
      const key = String(report.reportedUserId);
      reportCountByUserId.set(key, (reportCountByUserId.get(key) || 0) + 1);
    }

    let items = users.map((user, index) =>
      mapDriverListItem({
        index: skip + index,
        user,
        profile: profileByUserId.get(String(user._id)) || null,
        reportCount: reportCountByUserId.get(String(user._id)) || 0,
      })
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getDriverDetail(adminUserId, driverId) {
    await ensureAdminUser(adminUserId);

    const driver = await ensureDriverUser(driverId);

    const [profile, reportCount] = await Promise.all([
      DriverProfile.findOne({ userId: driverId }).lean(),
      Report.countDocuments({ reportedUserId: driverId }),
    ]);

    return {
      profile: {
        _id: driver._id,
        name: driver.name,
        email: driver.email || null,
        phone: driver.phone || null,
        emergency: driver.emergency || null,
        profileImage: driver.profileImage || null,
        joiningDate: driver.createdAt,
        userStatus: mapDocumentBadgeStatus(profile?.documentsStatus),
        driverStatus: profile?.status || "pending",
        rating: Number(driver.ratingAvg || 0),
        ratingCount: Number(driver.ratingCount || 0),
        accusedCount: reportCount || Number(driver.accusedCount || 0),
        documentsStatus: profile?.documentsStatus || "pending",
        requiredActionsCount: Number(profile?.requiredActionsCount || 0),
        deletion: computeDeletionInfo(driver),
      },
    };
  },

  async getDriverDocuments(adminUserId, driverId) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const [documents, vehicle] = await Promise.all([
      DriverDocument.find({ driverId }).sort({ createdAt: -1 }).lean(),
      Vehicle.findOne({ driverId, isActive: true }).lean(),
    ]);

    const docs = buildDocumentLookup(documents);
    const licenseStatuses = [
      normalizeDocumentStatus(docs.driver_license_front?.status),
      normalizeDocumentStatus(docs.driver_license_back?.status),
    ].filter((status) => status !== "missing");

    const combinedLicenseStatus = licenseStatuses.includes("rejected")
      ? "rejected"
      : licenseStatuses.includes("in_review")
        ? "in_review"
        : licenseStatuses.length === 2 && licenseStatuses.every((status) => status === "approved")
          ? "approved"
          : "missing";

    return {
      documents: [
        mapDocumentCard({
          key: "driver_license",
          title: "Driver License",
          status: combinedLicenseStatus,
          itemCount: 2,
        }),
        mapDocumentCard({
          key: "vehicle_information",
          title: "Vehicle Information",
          status: vehicle ? (vehicle.approved ? "approved" : "in_review") : "missing",
        }),
        mapDocumentCard({
          key: "vehicle_insurance",
          title: "Vehicle Insurance",
          status: docs.vehicle_insurance?.status || "missing",
        }),
        mapDocumentCard({
          key: "vehicle_registration",
          title: "Vehicle Registration",
          status: docs.vehicle_registration?.status || "missing",
        }),
      ],
    };
  },

  async getDriverDocumentDetail(adminUserId, driverId, type) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    if (type === "driver_license") {
      const [front, back] = await Promise.all([
        DriverDocument.findOne({ driverId, type: "driver_license_front" }).lean(),
        DriverDocument.findOne({ driverId, type: "driver_license_back" }).lean(),
      ]);

      return {
        type,
        title: "Driver License",
        status: mapDocumentBadgeStatus(
          normalizeDocumentStatus(front?.status) === "rejected" ||
            normalizeDocumentStatus(back?.status) === "rejected"
            ? "rejected"
            : normalizeDocumentStatus(front?.status) === "approved" &&
                normalizeDocumentStatus(back?.status) === "approved"
              ? "approved"
              : "in_review"
        ),
        items: [
          front
            ? {
                key: "driver_license_front",
                fileUrl: front.fileUrl,
                status: mapDocumentBadgeStatus(front.status),
                rejectionReason: front.rejectionReason || null,
              }
            : null,
          back
            ? {
                key: "driver_license_back",
                fileUrl: back.fileUrl,
                status: mapDocumentBadgeStatus(back.status),
                rejectionReason: back.rejectionReason || null,
              }
            : null,
        ].filter(Boolean),
      };
    }

    if (type === "vehicle_information") {
      const vehicle = await Vehicle.findOne({ driverId, isActive: true }).lean();

      if (!vehicle) {
        throw { status: 404, message: "Vehicle information not found" };
      }

      return {
        type,
        title: "Vehicle Information",
        status: vehicle.approved ? "verified" : "pending",
        vehicle,
      };
    }

    const docTypeMap = {
      vehicle_insurance: "vehicle_insurance",
      vehicle_registration: "vehicle_registration",
      profile_photo: "profile_photo",
    };

    const docType = docTypeMap[type];
    if (!docType) {
      throw { status: 400, message: "Invalid document type" };
    }

    const document = await DriverDocument.findOne({ driverId, type: docType }).lean();
    if (!document) {
      throw { status: 404, message: "Document not found" };
    }

    return {
      type,
      title: type
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      status: mapDocumentBadgeStatus(document.status),
      document: {
        _id: document._id,
        fileUrl: document.fileUrl,
        rejectionReason: document.rejectionReason || null,
        reviewedAt: document.reviewedAt || null,
      },
    };
  },

  async reviewDriverDocument(adminUserId, driverId, type, payload = {}) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const nextStatus = payload.status?.trim().toLowerCase();
    const rejectionReason = payload.rejectionReason?.trim() || null;

    const statusMap = {
      pending: "in_review",
      in_review: "in_review",
      verified: "approved",
      approved: "approved",
      denied: "rejected",
      rejected: "rejected",
    };

    const mappedStatus = statusMap[nextStatus];
    if (!mappedStatus) {
      throw { status: 400, message: "Invalid status value" };
    }

    if (mappedStatus === "rejected" && !rejectionReason) {
      throw { status: 400, message: "rejectionReason is required when denying a document" };
    }

    if (type === "vehicle_information") {
      const vehicle = await Vehicle.findOneAndUpdate(
        { driverId, isActive: true },
        { $set: { approved: mappedStatus === "approved" } },
        { new: true }
      ).lean();

      if (!vehicle) {
        throw { status: 404, message: "Vehicle information not found" };
      }

      const driverProfile = await refreshDriverReviewSummary(driverId);

      return {
        type,
        status: mappedStatus === "approved" ? "verified" : mappedStatus === "rejected" ? "denied" : "pending",
        vehicle,
        driverProfile: {
          status: driverProfile.status,
          documentsStatus: driverProfile.documentsStatus,
          requiredActionsCount: driverProfile.requiredActionsCount,
        },
      };
    }

    const docTypes =
      type === "driver_license"
        ? ["driver_license_front", "driver_license_back"]
        : [type];

    const result = await DriverDocument.updateMany(
      { driverId, type: { $in: docTypes } },
      {
        $set: {
          status: mappedStatus,
          rejectionReason: mappedStatus === "rejected" ? rejectionReason : null,
          reviewedBy: adminUserId,
          reviewedAt: new Date(),
        },
      }
    );

    if (!result.matchedCount) {
      throw { status: 404, message: "Document not found" };
    }

    const updatedDocuments = await DriverDocument.find({
      driverId,
      type: { $in: docTypes },
    }).lean();

    const driverProfile = await refreshDriverReviewSummary(driverId);

    return {
      type,
      status: mapDocumentBadgeStatus(mappedStatus),
      documents: updatedDocuments,
      driverProfile: {
        status: driverProfile.status,
        documentsStatus: driverProfile.documentsStatus,
        requiredActionsCount: driverProfile.requiredActionsCount,
      },
    };
  },

  async getDriverHistory(adminUserId, driverId) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const trips = await Trip.find({ driverId })
      .sort({ createdAt: -1 })
      .populate("riderId", "name profileImage")
      .populate("vehicleId", "brand model licensePlate")
      .lean();

    const tripIds = trips.map((trip) => trip._id);
    const riderRatings = tripIds.length
      ? await Rating.find({
          tripId: { $in: tripIds },
          toUserId: driverId,
        }).lean()
      : [];

    const ratingByTripId = new Map(
      riderRatings.map((rating) => [String(rating.tripId), rating])
    );

    return {
      items: trips.map((trip) =>
        mapTripCard(trip, ratingByTripId.get(String(trip._id)) || null)
      ),
    };
  },

  async getDriverTripDetail(adminUserId, driverId, tripId) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const trip = await Trip.findOne({ _id: tripId, driverId }).lean();
    if (!trip) {
      throw { status: 404, message: "Trip not found" };
    }

    const [rider, vehicle, ratings] = await Promise.all([
      User.findById(trip.riderId).select("name profileImage ratingAvg").lean(),
      Vehicle.findById(trip.vehicleId).select("brand model licensePlate").lean(),
      Rating.find({ tripId }).lean(),
    ]);

    const riderReview = ratings.find(
      (rating) =>
        String(rating.fromUserId) === String(trip.riderId) &&
        String(rating.toUserId) === String(driverId)
    );
    const driverReview = ratings.find(
      (rating) =>
        String(rating.fromUserId) === String(driverId) &&
        String(rating.toUserId) === String(trip.riderId)
    );

    return {
      trip: mapTripDetail({
        trip,
        rider,
        vehicle,
        riderReview,
        driverReview,
      }),
    };
  },

  async getDriverReports(adminUserId, driverId) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const reports = await Report.find({ reportedUserId: driverId })
      .sort({ createdAt: -1 })
      .populate("reporterId", "name profileImage role")
      .lean();

    return {
      items: reports.map((report) => ({
        _id: report._id,
        message: report.message,
        status: report.status,
        resolutionNote: report.resolutionNote || null,
        createdAt: report.createdAt,
        reporter: report.reporterId
          ? {
              _id: report.reporterId._id,
              name: report.reporterId.name,
              profileImage: report.reporterId.profileImage || null,
              role: report.reporterId.role || null,
            }
          : null,
      })),
    };
  },

  async updateDriverAccountStatus(adminUserId, driverId, payload = {}) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const nextStatus = payload.status?.trim().toLowerCase();
    if (!["active", "suspended", "pending"].includes(nextStatus)) {
      throw { status: 400, message: "status must be one of active, suspended, pending" };
    }

    const driverProfile = await DriverProfile.findOneAndUpdate(
      { userId: driverId },
      { $set: { status: nextStatus } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const user = await User.findByIdAndUpdate(
      driverId,
      {
        $set: {
          status: nextStatus === "suspended" ? "suspended" : "active",
        },
      },
      { new: true }
    ).lean();

    return {
      driver: {
        _id: user._id,
        userStatus: user.status,
      },
      driverProfile: {
        status: driverProfile.status,
      },
    };
  },

  async deleteDriver(adminUserId, driverId) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const user = await User.findByIdAndUpdate(
      driverId,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          status: "suspended",
        },
      },
      { new: true }
    ).lean();

    await DriverProfile.findOneAndUpdate(
      { userId: driverId },
      {
        $set: {
          status: "suspended",
          isOnline: false,
          isBusy: false,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return {
      message: "Driver deleted successfully",
      deletion: computeDeletionInfo(user),
    };
  },

  async restoreDriver(adminUserId, driverId) {
    await ensureAdminUser(adminUserId);
    await ensureDriverUser(driverId);

    const user = await User.findByIdAndUpdate(
      driverId,
      {
        $set: {
          isDeleted: false,
          status: "active",
        },
        $unset: {
          deletedAt: 1,
        },
      },
      { new: true }
    ).lean();

    return {
      message: "Driver restored successfully",
      deletion: computeDeletionInfo(user),
    };
  },
};
