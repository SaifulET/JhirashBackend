import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";

import cookieParser from "cookie-parser";

import mongoose from "mongoose";
import UserRouter from "./auth/auth.route.js";
import routdriverOnboardingRoute from "./driver/driver_documents/driver_documents.route.js";
import driverOnboardingReadRoutes from "./driver/driver_documents/driver_documents_read/driver_documents_read.route.js";
import riderGetRideRouter from "./riderGetRide/riderGetRide.route.js";
import adminConfigRouter from "./admin/config/fareConfig.route.js";
import driverHomeRouter from "./driverHome/driverHome.route.js";






const app = express();


// Middlewares

const allowedOrigins = [
  "*"
  
];

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());



app.get("/", (req, res) => {
 res.send("hellow");

});
app.use("/auth",UserRouter);
app.use("/driverOnboarding",routdriverOnboardingRoute)
app.use("/driverOnboardingRead", driverOnboardingReadRoutes);
app.use("/riderGetRide",riderGetRideRouter)
app.use("/admin/config",adminConfigRouter)
app.use("/driverHome",driverHomeRouter);

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error(err));

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`)
);