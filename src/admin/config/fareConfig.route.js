import express from "express";
import { fareConfigController } from "./fareConfig.controller.js";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";

const adminConfigRouter = express.Router();

adminConfigRouter.use(requireAuth);

adminConfigRouter.get("/", fareConfigController.getConfig);

adminConfigRouter.post("/", fareConfigController.createConfig);

adminConfigRouter.patch("/", fareConfigController.updateConfig);

export default adminConfigRouter;