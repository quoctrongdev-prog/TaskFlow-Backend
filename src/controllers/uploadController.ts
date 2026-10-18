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
