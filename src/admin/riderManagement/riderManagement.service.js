import { User } from "../../models/User/User.model.js";
import { RiderProfile } from "../../models/Rider_profile/Rider_profile.model.js";
import { Vehicle } from "../../models/Vehicle/Vehicle.model.js";
import { Trip } from "../../models/Trip/Trip.model.js";
import { Payment } from "../../models/Payment/Payment.model.js";
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

const ensureRiderUser = async (riderId) => {
  const user = await User.findById(riderId).lean();

  if (!user) {
    throw { status: 404, message: "Rider not found" };
  }

  if (user.role !== "rider") {
    throw { status: 403, message: "Selected user is not a rider" };
  }

  return user;
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

const mapRiderListItem = ({ index, user, reportCount }) => ({
  no: index + 1,
  _id: user._id,
  riderName: user.name,
  email: user.email || null,
  contact: user.phone || null,
  userStatus: user.status || "active",
  deletionStatus: user.isDeleted ? "yes" : "no",
  rating: Number(user.ratingAvg || 0),
  reportsCount: Number(reportCount || 0),
  createdAt: user.createdAt,
});

const toCurrencyNumber = (value) => Number(Number(value || 0).toFixed(2));

const mapTripFare = (trip) => ({
  currency: (trip?.pricing?.currency || "USD").toUpperCase(),
  estimatedFare: Number(trip?.pricing?.estimatedFare || 0),
  finalFare: Number(trip?.pricing?.finalFare || 0),
  total: Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0),
});

const computeDriverGets = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  const sharePercent = Number(trip?.pricing?.driverSharePercent || 0);
  return toCurrencyNumber((totalFare * sharePercent) / 100);
};

const computePlatformGets = (trip) => {
  const totalFare = Number(trip?.pricing?.finalFare || trip?.pricing?.estimatedFare || 0);
  return toCurrencyNumber(totalFare - computeDriverGets(trip));
};

const mapVehicleSummary = (vehicle) =>
  vehicle
    ? {
        _id: vehicle._id,
        brand: vehicle.brand,
        model: vehicle.model,
        type: vehicle.type,
        size: vehicle.size,
        licensePlate: vehicle.licensePlate || null,
      }
    : null;

const mapDriverSummary = (driver) =>
  driver
    ? {
        _id: driver._id,
        name: driver.name,
        profileImage: driver.profileImage || null,
        ratingAvg: Number(driver.ratingAvg || 0),
        ratingCount: Number(driver.ratingCount || 0),
      }
    : null;

const mapReviewSummary = (review) =>
  review
    ? {
        _id: review._id,
        stars: Number(review.stars || 0),
        comment: review.comment || "",
        createdAt: review.createdAt,
      }
    : null;

const mapRiderHistoryItem = ({ trip, driverReview, riderReview }) => ({
  _id: trip._id,
  status: trip.status,
  createdAt: trip.createdAt,
  updatedAt: trip.updatedAt,
  fare: mapTripFare(trip),
  driver: mapDriverSummary(trip.driverId),
  vehicle: mapVehicleSummary(trip.vehicleId),
  driverReview: mapReviewSummary(driverReview),
  riderReview: mapReviewSummary(riderReview),
});

const mapRiderTripDetail = ({ trip, driver, vehicle, driverReview, riderReview }) => ({
  _id: trip._id,
  requestId: trip.requestId || null,
  status: trip.status,
  createdAt: trip.createdAt,
  updatedAt: trip.updatedAt,
  fare: mapTripFare(trip),
  pickup: trip.pickup,
  dropoff: trip.dropoff,
  distanceMiles: Number(trip.distanceMiles || 0),
  durationMinutes: Number(trip.durationMinutes || 0),
  cancellation: trip.cancellation || null,
  paymentStatus: trip.paymentStatus || null,
  driver: mapDriverSummary(driver),
  vehicle: mapVehicleSummary(vehicle),
  driverReview: mapReviewSummary(driverReview),
  riderReview: mapReviewSummary(riderReview),
});

const mapPaymentSummary = (payment, trip = null) => {
  if (!payment && !trip) {
    return null;
  }

  const currency = (payment?.currency || trip?.pricing?.currency || "USD").toUpperCase();
  const totalFare = payment ? Number(payment.totalFare || 0) : mapTripFare(trip).total;
  const driverGets = payment ? Number(payment.driverGets || 0) : computeDriverGets(trip);
  const platformGets = payment ? Number(payment.platformGets || 0) : computePlatformGets(trip);

  return {
    _id: payment?._id || null,
    provider: payment?.provider || null,
    status: payment?.status || null,
    currency,
    totalFare,
    driverGets,
    platformGets,
    received: platformGets,
    paidAt: payment?.paidAt || null,
    failureMessage: payment?.failureMessage || null,
    stripeCustomerId: payment?.stripeCustomerId || null,
    stripePaymentIntentId: payment?.stripePaymentIntentId || null,
    stripePaymentMethodId: payment?.stripePaymentMethodId || null,
    breakdown: payment?.breakdown
      ? {
          cancellationFee: Number(payment.breakdown.cancellationFee || 0),
          platformFee: Number(payment.breakdown.platformFee || 0),
        }
      : null,
    createdAt: payment?.createdAt || null,
    updatedAt: payment?.updatedAt || null,
  };
};

const mapRiderPaymentItem = ({ index, payment, trip }) => ({
  no: index + 1,
  _id: payment._id,
  tripId: payment.tripId?._id || payment.tripId || trip?._id || null,
  paymentId: payment._id,
  rider: payment.riderId
    ? {
        _id: payment.riderId._id,
        name: payment.riderId.name,
        profileImage: payment.riderId.profileImage || null,
        ratingAvg: Number(payment.riderId.ratingAvg || 0),
        ratingCount: Number(payment.riderId.ratingCount || 0),
      }
    : null,
  riderName: payment.riderId?.name || null,
  driver: mapDriverSummary(payment.driverId),
  driverName: payment.driverId?.name || null,
  tripStatus: trip?.status || null,
  paymentStatus: payment.status,
  tripPaymentStatus: trip?.paymentStatus || null,
  totalFare: Number(payment.totalFare || 0),
  driverGets: Number(payment.driverGets || 0),
  platformGets: Number(payment.platformGets || 0),
  received: Number(payment.platformGets || 0),
  currency: (payment.currency || "USD").toUpperCase(),
  paidAt: payment.paidAt || null,
  createdAt: payment.createdAt,
});

export const riderManagementService = {
  async listRiders(adminUserId, query = {}) {
    await ensureAdminUser(adminUserId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const search = query.search?.trim();
    const userStatus = query.userStatus?.trim().toLowerCase();
    const deletionStatus = query.deletionStatus?.trim().toLowerCase();

    const userFilter = {
      role: "rider",
    };

    if (deletionStatus === "yes") {
      userFilter.isDeleted = true;
    } else if (deletionStatus === "no") {
      userFilter.isDeleted = { $ne: true };
    }

    if (["active", "suspended"].includes(userStatus)) {
      userFilter.status = userStatus;
    }

    if (search) {
      userFilter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(userFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(userFilter),
    ]);

    const riderIds = users.map((user) => user._id);
    const reports = riderIds.length
      ? await Report.find({ reportedUserId: { $in: riderIds } })
          .select("reportedUserId")
          .lean()
      : [];

    const reportCountByUserId = new Map();
    for (const report of reports) {
      const key = String(report.reportedUserId);
      reportCountByUserId.set(key, (reportCountByUserId.get(key) || 0) + 1);
    }

    return {
      items: users.map((user, index) =>
        mapRiderListItem({
          index: skip + index,
          user,
          reportCount: reportCountByUserId.get(String(user._id)) || 0,
        })
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getRiderDetail(adminUserId, riderId) {
    await ensureAdminUser(adminUserId);

    const rider = await ensureRiderUser(riderId);

    const [profile, reportCount, tripCount] = await Promise.all([
      RiderProfile.findOne({ userId: riderId }).lean(),
      Report.countDocuments({ reportedUserId: riderId }),
      Trip.countDocuments({ riderId }),
    ]);

    return {
      profile: {
        _id: rider._id,
        name: rider.name,
        email: rider.email || null,
        phone: rider.phone || null,
        emergency: rider.emergency || null,
        profileImage: rider.profileImage || null,
        joiningDate: rider.createdAt,
        userStatus: rider.status || "active",
        rating: Number(rider.ratingAvg || 0),
        ratingCount: Number(rider.ratingCount || 0),
        accusedCount: Number(reportCount || rider.accusedCount || 0),
        tripsCount: Number(tripCount || 0),
        savedPlacesCount: Number(profile?.savedPlaces?.length || 0),
        deletion: computeDeletionInfo(rider),
      },
    };
  },

  async listAllRiderPayments(adminUserId, query = {}) {
    await ensureAdminUser(adminUserId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter = {};
    const paymentStatus = query.paymentStatus?.trim().toLowerCase();

    if (["pending", "succeeded", "failed", "refunded"].includes(paymentStatus)) {
      filter.status = paymentStatus;
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("riderId", "name profileImage ratingAvg ratingCount")
        .populate("driverId", "name profileImage ratingAvg ratingCount")
        .populate("tripId", "status paymentStatus pricing createdAt updatedAt")
        .lean(),
      Payment.countDocuments(filter),
    ]);

    return {
      items: payments.map((payment, index) =>
        mapRiderPaymentItem({
          index: skip + index,
          payment,
          trip: payment.tripId || null,
        })
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getRiderPayments(adminUserId, riderId, query = {}) {
    await ensureAdminUser(adminUserId);
    await ensureRiderUser(riderId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find({ riderId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("driverId", "name profileImage ratingAvg ratingCount")
        .populate("tripId", "status paymentStatus pricing createdAt updatedAt")
        .lean(),
      Payment.countDocuments({ riderId }),
    ]);

    return {
      items: payments.map((payment, index) =>
        mapRiderPaymentItem({
          index: skip + index,
          payment,
          trip: payment.tripId || null,
        })
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getRiderHistory(adminUserId, riderId) {
    await ensureAdminUser(adminUserId);
    await ensureRiderUser(riderId);

    const trips = await Trip.find({ riderId })
      .sort({ createdAt: -1 })
      .populate("driverId", "name profileImage ratingAvg ratingCount")
      .populate("vehicleId", "brand model type size licensePlate")
      .lean();

    const tripIds = trips.map((trip) => trip._id);
    const ratings = tripIds.length ? await Rating.find({ tripId: { $in: tripIds } }).lean() : [];

    const ratingsByTripId = new Map();
    for (const rating of ratings) {
      const key = String(rating.tripId);
      if (!ratingsByTripId.has(key)) {
        ratingsByTripId.set(key, []);
      }
      ratingsByTripId.get(key).push(rating);
    }

    return {
      items: trips.map((trip) => {
        const tripRatings = ratingsByTripId.get(String(trip._id)) || [];
        const driverReview = tripRatings.find(
          (rating) =>
            String(rating.fromUserId) === String(trip.driverId?._id || trip.driverId) &&
            String(rating.toUserId) === String(riderId)
        );
        const riderReview = tripRatings.find(
          (rating) =>
            String(rating.fromUserId) === String(riderId) &&
            String(rating.toUserId) === String(trip.driverId?._id || trip.driverId)
        );

        return mapRiderHistoryItem({
          trip,
          driverReview,
          riderReview,
        });
      }),
    };
  },

  async getRiderTripDetail(adminUserId, riderId, tripId) {
    await ensureAdminUser(adminUserId);
    await ensureRiderUser(riderId);

    const trip = await Trip.findOne({ _id: tripId, riderId }).lean();
    if (!trip) {
      throw { status: 404, message: "Trip not found" };
    }

    const [driver, vehicle, ratings, payment] = await Promise.all([
      User.findById(trip.driverId).select("name profileImage ratingAvg ratingCount").lean(),
      trip.vehicleId
        ? Vehicle.findById(trip.vehicleId)
            .select("brand model type size licensePlate")
            .lean()
        : null,
      Rating.find({ tripId }).lean(),
      Payment.findOne({ tripId, riderId }).lean(),
    ]);

    const driverReview = ratings.find(
      (rating) =>
        String(rating.fromUserId) === String(trip.driverId) &&
        String(rating.toUserId) === String(riderId)
    );
    const riderReview = ratings.find(
      (rating) =>
        String(rating.fromUserId) === String(riderId) &&
        String(rating.toUserId) === String(trip.driverId)
    );

    return {
      trip: mapRiderTripDetail({
        trip,
        driver,
        vehicle,
        driverReview,
        riderReview,
      }),
      payment: mapPaymentSummary(payment, trip),
    };
  },

  async getRiderReports(adminUserId, riderId) {
    await ensureAdminUser(adminUserId);
    await ensureRiderUser(riderId);

    const reports = await Report.find({ reportedUserId: riderId })
      .sort({ createdAt: -1 })
      .populate("reporterId", "name profileImage role")
      .lean();

    return {
      items: reports.map((report) => ({
        _id: report._id,
        tripId: report.tripId || null,
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

  async updateRiderAccountStatus(adminUserId, riderId, payload = {}) {
    await ensureAdminUser(adminUserId);
    await ensureRiderUser(riderId);

    const nextStatus = payload.status?.trim().toLowerCase();
    if (!["active", "suspended"].includes(nextStatus)) {
      throw { status: 400, message: "status must be one of active, suspended" };
    }

    const user = await User.findByIdAndUpdate(
      riderId,
      {
        $set: {
          status: nextStatus,
        },
      },
      { new: true }
    ).lean();

    return {
      rider: {
        _id: user._id,
        userStatus: user.status,
      },
    };
  },

  async deleteRider(adminUserId, riderId) {
    await ensureAdminUser(adminUserId);
    await ensureRiderUser(riderId);

    const user = await User.findByIdAndUpdate(
      riderId,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          status: "suspended",
        },
      },
      { new: true }
    ).lean();

    return {
      message: "Rider deleted successfully",
      deletion: computeDeletionInfo(user),
    };
  },

  async restoreRider(adminUserId, riderId) {
    await ensureAdminUser(adminUserId);
    await ensureRiderUser(riderId);

    const user = await User.findByIdAndUpdate(
      riderId,
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
      message: "Rider restored successfully",
      deletion: computeDeletionInfo(user),
    };
  },
};
