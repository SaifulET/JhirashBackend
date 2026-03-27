import express from "express";
import { requireAuth } from "../../core_feature/middleware/requireAuth.js";
import { customerSupportController } from "./customerSupport.controller.js";

const adminCustomerSupportRouter = express.Router();

adminCustomerSupportRouter.use(requireAuth);

adminCustomerSupportRouter.get("/", customerSupportController.listItems);
adminCustomerSupportRouter.get("/:entryId", customerSupportController.getItemDetail);
adminCustomerSupportRouter.patch("/:entryId/action", customerSupportController.takeAction);
adminCustomerSupportRouter.delete("/:entryId", customerSupportController.deleteItem);

export default adminCustomerSupportRouter;
