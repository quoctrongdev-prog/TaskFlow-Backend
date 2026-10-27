import express from "express";
import uploadFile from "../middlewares/multer.js";
import {
  uploadTest,
  upload,
  uploadProjectImage,
} from "../controllers/uploadController.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/upload", authMiddleware, uploadFile, upload);
router.post("/:projectId/upload-image", authMiddleware, uploadFile, uploadProjectImage);
router.post("/upload-test", uploadFile, uploadTest);

export default router;
