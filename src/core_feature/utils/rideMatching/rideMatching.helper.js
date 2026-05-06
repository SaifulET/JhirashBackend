import { DriverProfile } from "../../../models/Driver_profile/Driver_profile.model.js";

export const TWO_MILES_IN_METERS = 3219;
export const TEN_KILOMETERS_IN_METERS = 10000;
export const TEN_KILOMETERS_IN_MILES = Number(
  (TEN_KILOMETERS_IN_METERS / 1609.344).toFixed(2)
);
export const DRIVER_DISPATCH_ELIGIBLE_STATUSES = ["active"];
export const hasCompletedDriverRequirements = (driverProfile) =>
  Boolean(
    driverProfile?.documentsStatus === "verified" &&
      Number(driverProfile?.requiredActionsCount || 0) === 0
  );

export const buildNearbyPointQuery = ({
  lng,
  lat,
  maxDistance = TEN_KILOMETERS_IN_METERS,
}) => ({
  $near: {
    $geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    $maxDistance: maxDistance,
  },
});

export const findNearbyAvailableDrivers = async ({
  lng,
  lat,
  maxDistance = TEN_KILOMETERS_IN_METERS,
  populate = false,
  lean = true,
  vehicleFilters = null,
} = {}) => {
  const vehicleMatch = vehicleFilters
    ? {
        ...(vehicleFilters.vehicleType ? { type: vehicleFilters.vehicleType } : {}),
        ...(vehicleFilters.tier ? { tier: vehicleFilters.tier } : {}),
        ...(Number.isFinite(Number(vehicleFilters.seats))
          ? { seats: { $gte: Number(vehicleFilters.seats) } }
          : {}),
      }
    : null;

  let query = DriverProfile.find({
    status: { $in: DRIVER_DISPATCH_ELIGIBLE_STATUSES },
    documentsStatus: "verified",
    requiredActionsCount: 0,
    isOnline: true,
    isBusy: false,
    activeVehicleId: { $ne: null },
    "location.point": buildNearbyPointQuery({ lng, lat, maxDistance }),
  });
 

  if (populate) {
    query = query
      .populate("userId", "name profileImage ratingAvg ratingCount")
      .populate({
        path: "activeVehicleId",
        select: "brand model type tier size seats licensePlate",
        ...(vehicleMatch ? { match: vehicleMatch } : {}),
      });
  }

  if (lean) {
    query = query.lean();
  }

  const profiles = await query;

  if (!vehicleFilters) {
    return profiles;
  }

  return profiles.filter((profile) => Boolean(profile?.activeVehicleId));
};
