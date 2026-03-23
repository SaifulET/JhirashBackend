import { RideRequest } from "../models/Ride_request/Ride_request.model.js";
import { DriverProfile } from "../models/Driver_profile/Driver_profile.model.js";
import {
  DRIVER_DISPATCH_ELIGIBLE_STATUSES,
  TEN_KILOMETERS_IN_METERS,
  TEN_KILOMETERS_IN_MILES,
} from "../core_feature/utils/rideMatching/rideMatching.helper.js";
import { emitToUser } from "../messages/socketRealtime.helper.js";

export const RIDE_REQUEST_RADIUS_METERS = TEN_KILOMETERS_IN_METERS;
export const RIDE_REQUEST_RADIUS_KM = 10;
export const RIDE_REQUEST_RADIUS_MILES = TEN_KILOMETERS_IN_MILES;

export const buildRideRequestQuery = (
  driverProfile,
  maxDistanceMeters = RIDE_REQUEST_RADIUS_METERS
) => {
  const coordinates = driverProfile?.location?.point?.coordinates || [0, 0];

  return {
    status: "searching",
    expiresAt: { $gt: new Date() },
    "pickup.point": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates,
        },
        $maxDistance: maxDistanceMeters,
      },
    },
  };
};

export const getDriverQueuePayload = async (
  driverProfile,
  {
    maxDistanceMeters = RIDE_REQUEST_RADIUS_METERS,
    radiusMiles = RIDE_REQUEST_RADIUS_MILES,
    radiusKm = RIDE_REQUEST_RADIUS_KM,
  } = {}
) => {
  const requests = await RideRequest.find(buildRideRequestQuery(driverProfile, maxDistanceMeters))
    .sort({ createdAt: 1 })
    .populate("riderId", "name profileImage ratingAvg ratingCount")
    .lean();

  return {
    requests,
    radiusMiles,
    radiusKm,
  };
};

export const getNearbyRideRequestsPayload = async (driverProfile) => {
  return getDriverQueuePayload(driverProfile, {
    maxDistanceMeters: RIDE_REQUEST_RADIUS_METERS,
    radiusMiles: RIDE_REQUEST_RADIUS_MILES,
    radiusKm: RIDE_REQUEST_RADIUS_KM,
  });
};

export const isDriverQueueEligible = (driverProfile) =>
  Boolean(
    driverProfile?.isOnline &&
      !driverProfile?.isBusy &&
      DRIVER_DISPATCH_ELIGIBLE_STATUSES.includes(driverProfile?.status)
  );

export const emitDriverQueuePayloadToUser = async (driverId, triggeredBy = "system_update") => {
  const driverProfile = await DriverProfile.findOne({ userId: driverId }).lean();

  if (!isDriverQueueEligible(driverProfile)) {
    emitToUser(driverId, "ride-request:queue", {
      requests: [],
      radiusMiles: RIDE_REQUEST_RADIUS_MILES,
      radiusKm: RIDE_REQUEST_RADIUS_KM,
      triggeredBy,
    });
    return;
  }

  const queue = await getNearbyRideRequestsPayload(driverProfile);

  emitToUser(driverId, "ride-request:queue", {
    ...queue,
    triggeredBy,
  });
};

export const emitDriverQueuePayloadToUsers = async (
  driverIds = [],
  triggeredBy = "system_update"
) => {
  const uniqueDriverIds = [...new Set(driverIds.filter(Boolean).map((driverId) => String(driverId)))];

  await Promise.all(
    uniqueDriverIds.map((driverId) => emitDriverQueuePayloadToUser(driverId, triggeredBy))
  );
};
