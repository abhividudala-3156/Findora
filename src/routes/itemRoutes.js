
import { Router } from "express";

import {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem
} from "../controllers/itemController.js";

const router = Router();

router.route("/")
  .get(getItems)
  .post(createItem);

router.route("/:id")
  .get(getItemById)
  .patch(updateItem)
  .delete(deleteItem);

export default router;
