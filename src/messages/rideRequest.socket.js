import { DriverProfile } from "../models/Driver_profile/Driver_profile.model.js";
import {
  getDriverQueuePayload,
  RIDE_REQUEST_RADIUS_KM,
  RIDE_REQUEST_RADIUS_MILES,
} from "../driverHome/driverRideRequestQueue.helper.js";

const emitDriverQueue = async (socket, triggeredBy) => {
  if (socket.user.role !== "driver") {
    return;
  }

  const profile = await DriverProfile.findOne({ userId: socket.user.id }).lean();

  if (!profile || !profile.isOnline || profile.isBusy || profile.status !== "active") {
    socket.emit("ride-request:queue", {
      requests: [],
      radiusMiles: RIDE_REQUEST_RADIUS_MILES,
      radiusKm: RIDE_REQUEST_RADIUS_KM,
      triggeredBy,
    });
    return;
  }

  const queue = await getDriverQueuePayload(profile);

  socket.emit("ride-request:queue", {
    ...queue,
    triggeredBy,
  });
};

export const registerRideRequestSocket = (io) => {
  io.on("connection", (socket) => {
    emitDriverQueue(socket, "socket_connected").catch(() => {
      socket.emit("ride-request:error", {
        message: "Failed to sync ride requests",
      });
    });

    socket.on("ride-request:sync", async () => {
      try {
        await emitDriverQueue(socket, "manual_sync");
      } catch (error) {
        socket.emit("ride-request:error", {
          message: error.message || "Failed to sync ride requests",
        });
      }
    });
  });
};
