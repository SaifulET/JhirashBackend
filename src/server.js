import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import http from "http";

import { initSocket } from "./messages/socket.js";

import UserRouter from "./auth/auth.route.js";
import routdriverOnboardingRoute from "./driver/driver_documents/driver_documents.route.js";
import driverOnboardingReadRoutes from "./driver/driver_documents/driver_documents_read/driver_documents_read.route.js";
import riderGetRideRouter from "./riderGetRide/riderGetRide.route.js";
import adminConfigRouter from "./admin/config/fareConfig.route.js";
import legalContentRouter from "./admin/legalContent/legalContent.route.js";
import adminDriverManagementRouter from "./admin/driverManagement/driverManagement.route.js";
import driverHomeRouter from "./driverHome/driverHome.route.js";
import tripChatRouter from "./messages/tripChat.route.js";

mongoose.set("bufferCommands", false);

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("hellow");
});

app.get("/health", (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;

  res.status(isConnected ? 200 : 503).json({
    success: isConnected,
    database: isConnected ? "connected" : "disconnected",
  });
});

app.use("/auth", UserRouter);
app.use("/driverOnboarding", routdriverOnboardingRoute);
app.use("/driverOnboardingRead", driverOnboardingReadRoutes);
app.use("/riderGetRide", riderGetRideRouter);
app.use("/admin/config", adminConfigRouter);
app.use("/admin/drivers", adminDriverManagementRouter);
app.use("/legal-content", legalContentRouter);
app.use("/admin/legal-content", legalContentRouter);
app.use("/driverHome", driverHomeRouter);
app.use("/chat", tripChatRouter);

// HTTP server for socket.io
const server = http.createServer(app);

// initialize socket
initSocket(server);

// Start Server
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT) || 5001;

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other process using this port or change PORT in .env.`
    );
    process.exit(1);
  }

  console.error("Server failed to start:", error);
  process.exit(1);
});

async function startServer() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB Connected");

  server.listen(PORT, HOST, () => console.log(`Server running on port ${PORT}`));
}

startServer().catch((error) => {
  console.error("Failed to connect to MongoDB:", error);
  process.exit(1);
});
