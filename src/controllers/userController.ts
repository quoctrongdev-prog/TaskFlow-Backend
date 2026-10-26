import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import ErrorHandler from "../config/errorHandler.js";
import sql from "../config/db.js";
import bcrypt from "bcrypt";

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new ErrorHandler(401, "Unauthorized");
    }
    // console.log("userId:", userId);
    const { password, newPassword } = req.body;
    if (!password || !newPassword) {
      throw new ErrorHandler(400, "Please give all details");
    }

    const user =
      await sql`SELECT user_id, name, password_hash FROM users WHERE user_id = ${userId}`;

    if (user.length > 0) {
      const isValid = await bcrypt.compare(password, user[0].password_hash);
      if (!isValid) {
        throw new ErrorHandler(401, "Invalid password");
      }
      const changePass = await bcrypt.hash(newPassword, 10);
      await sql`UPDATE users SET password_hash = ${changePass} WHERE user_id = ${userId}`;
      res.status(200).json({
        message: "Change password successfully",
      });
    } else {
      throw new ErrorHandler(404, "User not found");
    }
  } catch (error) {
    console.error("Change password error:", error);

    if (error instanceof ErrorHandler) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const getUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new ErrorHandler(401, "Unauthorized");
    }

    const record =
      await sql`SELECT user_id, name, email, avatar_url, created_at, updated_at 
      FROM users 
      WHERE user_id = ${userId}`;
    if (record.length === 0) {
      throw new ErrorHandler(404, "User not found");
    }
    const user = record[0];

    res.status(200).json({
      message: "Get profile user successfully",
      user: user,
    });
  } catch (error) {
    console.error("Get user error:", error);

    if (error instanceof ErrorHandler) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new ErrorHandler(401, "Unauthorized");
    }

    const { name } = req.body;
    if (!name) {
      throw new ErrorHandler(400, "Name is required");
    }

    const record =
      await sql`SELECT user_id, name FROM users WHERE user_id = ${userId}`;
    if (record.length === 0) {
      throw new ErrorHandler(404, "User not found");
    }
    const user = record[0];

    const newName = name || user.name;

    const update =
      await sql`UPDATE users SET name = ${newName}, updated_at = NOW() 
    WHERE user_id = ${userId}
    RETURNING name, updated_at`;

    const updatedUser = update[0];

    res.status(200).json({
      message: "Update user info successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);

    if (error instanceof ErrorHandler) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
