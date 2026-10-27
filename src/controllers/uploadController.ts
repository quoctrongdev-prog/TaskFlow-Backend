import { Response } from "express";
import cloudinary from "../config/cloudinary.js";
import ErrorHandler from "../config/errorHandler.js";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import sql from "../config/db.js";

const upload = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const file = req.file;

    console.log("Upload avatar debug:", {
      userId,
      hasFile: !!file,
      fileName: file?.originalname,
      mimeType: file?.mimetype,
      size: file?.size,
    });

    // Kiểm tra user đăng nhập
    if (!userId) {
      throw new ErrorHandler(401, "Unauthorized");
    }

    // Kiểm tra file
    if (!file || !file.buffer || file.size === 0) {
      throw new ErrorHandler(400, "File cannot be empty");
    }

    // Lấy avatar hiện tại của user
    const record = await sql`
      SELECT user_id, avatar_url, avatar_public_id
      FROM users
      WHERE user_id = ${userId}
    `;

    // User không tồn tại
    if (record.length === 0) {
      throw new ErrorHandler(404, "User not found");
    }

    const user = record[0];

    const cloud = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "avatars",
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );

      stream.end(file.buffer);
    });

    // Lưu thông tin avatar mới vào database
    await sql`
      UPDATE users
      SET
        avatar_url = ${cloud.secure_url},
        avatar_public_id = ${cloud.public_id},
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    // Nếu user đã có avatar thì xóa avatar cũ
    // public_id trên cloudinary
    if (user.avatar_public_id) {
      await cloudinary.uploader.destroy(user.avatar_public_id);
    }

    return res.status(200).json({
      message: "Avatar uploaded successfully",
      url: cloud.secure_url,
      public_id: cloud.public_id,
      // message: "Avatar uploaded successfully",
    });
  } catch (error: any) {
    console.error("Upload avatar error:", error);

    return res.status(500).json({
      message: error?.message || "Upload failed",
      http_code: error?.http_code,
      name: error?.name,
    });
  }
};

export const uploadProjectImage = async (req: AuthRequest, res: Response) => {
  let uploadedPublicId: string | undefined;

  try {
    const userId = req.userId;
    const projectId = req.params.projectId;
    const file = req.file;

    if (!userId) {
      throw new ErrorHandler(401, "Authentication required");
    }

    if (!file?.buffer || file.size === 0) {
      throw new ErrorHandler(400, "Project image cannot be empty");
    }

    if (!file.mimetype.startsWith("image/")) {
      throw new ErrorHandler(400, "Only image files are allowed");
    }

    // Chỉ Admin của project mới được thay ảnh.
    const [project] = await sql`
      SELECT p.project_id, p.image_public_id
      FROM projects p
      JOIN project_members pm
        ON pm.project_id = p.project_id
      WHERE p.project_id = ${projectId}
        AND pm.user_id = ${userId}
        AND pm.role = 'Admin'
    `;

    if (!project) {
      throw new ErrorHandler(
        404,
        "Project not found or you don't have permission",
      );
    }

    const uploadedImage = await new Promise<{
      secure_url: string;
      public_id: string;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "projects",
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result) {
            reject(new Error("Cloudinary returned no upload result"));
            return;
          }

          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        },
      );

      stream.end(file.buffer);
    });

    uploadedPublicId = uploadedImage.public_id;

    await sql`
      UPDATE projects
      SET
        image_url = ${uploadedImage.secure_url},
        image_public_id = ${uploadedImage.public_id},
        updated_at = NOW()
      WHERE project_id = ${projectId}
    `;

    // Chỉ xóa ảnh cũ sau khi ảnh mới đã upload và được lưu.
    if (project.image_public_id) {
      try {
        await cloudinary.uploader.destroy(project.image_public_id);
      } catch (error) {
        // Không làm thất bại request vì xóa ảnh cũ bị lỗi.
        console.error("Delete old project image error:", error);
      }
    }

    return res.status(200).json({
      message: "Project image uploaded successfully",
      image_url: uploadedImage.secure_url,
      image_public_id: uploadedImage.public_id,
    });
  } catch (error) {
    // Nếu upload thành công nhưng lưu database thất bại,
    // cố gắng xóa ảnh mới để tránh ảnh rác trên Cloudinary.
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId);
      } catch (cleanupError) {
        console.error("Cleanup uploaded project image error:", cleanupError);
      }
    }

    if (error instanceof ErrorHandler) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    console.error("Upload project image error:", error);

    return res.status(500).json({
      message: "Unable to upload project image",
    });
  }
};

const uploadTest = async (req: AuthRequest, res: Response) => {
  const file = req.file;

  if (!file || !file.buffer || file.size === 0) {
    throw new ErrorHandler(400, "File cannot be empty");
  }

  // Chuyển Buffer thành Data URI để Cloudinary có thể nhận diện
  const b64 = Buffer.from(file.buffer).toString("base64");
  const dataURI = `data:${file.mimetype};base64,${b64}`;

  try {
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "avatars", // Tùy chọn thư mục trên Cloudinary
    });

    return res.status(200).json({
      success: true,
      message: "Upload thành công",
      data: result,
    });
  } catch (error: any) {
    console.error("Lỗi Cloudinary chi tiết:", error);
    throw new ErrorHandler(
      500,
      error.message || "Lỗi khi upload lên Cloudinary",
    );
  }
};

export { uploadTest, upload };
