import { Router } from "express";
import {
  getTaskComments,
  createComment,
  updateComment,
  deleteComment,
} from "../controllers/commentController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = Router();

router.get("/tasks/:taskId/", authMiddleware, getTaskComments);
router.post("/tasks/:taskId/", authMiddleware, createComment);
router.patch("/:commentId", authMiddleware, updateComment);
router.delete("/:commentId", authMiddleware, deleteComment);

export default router;
