import { Request, Response } from "express";
import dotenv from "dotenv";
import ErrorHandler from "../config/errorHandler.js";
import crypto from "crypto";
import sql from "../config/db.js";
import { generateSecureToken } from "../utils/generateSecureToken.js";
import {
  sendForgotPassword,
  sendVerificationEmail,
} from "../utils/sendVerificationEmail.js";
import bcrypt from "bcrypt";

dotenv.config();

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      throw new ErrorHandler(400, "Verification token is required");
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const verificationToken = await sql`
      SELECT
        token_id,
        user_id,
        expires_at,
        used_at
      FROM email_verification_tokens
      WHERE token = ${tokenHash}
    `;

    if (verificationToken.length === 0) {
      throw new ErrorHandler(400, "Invalid verification token");
    }

    const record = verificationToken[0];

    //đã được sử dụng chưa
    if (record.used_at) {
      throw new ErrorHandler(400, "Verification token has already been used");
    }

    //Còn hạn không
    if (new Date(record.expires_at) < new Date()) {
      throw new ErrorHandler(400, "Verification token has expired");
    }

    await sql`
      UPDATE users
      SET email_verified = true
      WHERE user_id = ${record.user_id}
    `;

    await sql`
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE token_id = ${record.token_id}
    `;

    return res.status(200).json({
      message: "Email verified successfully",
    });
  } catch (error) {
    throw error;
  }
};

export const resendVerifyEmail = async (req: Request, res: Response) => {
  try {
    const email = req.body.email?.toLowerCase().trim();

    if (!email) {
      throw new ErrorHandler(400, "Email is required");
    }

    const findUser =
      await sql`SELECT user_id, email_verified FROM users WHERE email = ${email}`;

    if (findUser.length === 0) {
      throw new ErrorHandler(404, "Email not found");
    }

    const user = findUser[0];

    if (user.email_verified) {
      return res.status(200).json({
        message: "Email already verified!",
      });
    }

    //Đặt token là đã sử dụng nếu user đã kích hoạt
    //nếu token còn thời hạn thì sẽ không làm gì cả
    //Điều kiện WHERE: AND used_at IS NULL
    //Invalidate token hiện tại (cũ)
    await sql`
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE user_id = ${user.user_id} AND used_at IS NULL
    `;
    //=> Tìm tất cả token của user này mà hiện tại vẫn đang active/chưa bị sử dụng. User này có những verification token nào chưa được sử dụng? Lấy tất cả chúng và vô hiệu hóa. Bên login if nếu used_at truth thì throw error vô hiệu hóa

    const { token, tokenHash } = generateSecureToken();

    const expiresAt = new Date();
    //đặt phút của expiresAt thành phút thứ 15 sau phút hiện tại của expiresAt
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await sql`INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES
    (${user.user_id}, ${tokenHash}, ${expiresAt})`;

    await sendVerificationEmail(email, token);

    res.status(200).json({
      message: "Resend link successfully!",
      // token: token, // hồi comment lại
    });
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const sendResetPassword = async (req: Request, res: Response) => {
  try {
    const email = req.body.email?.toLowerCase().trim();

    if (!email) {
      throw new ErrorHandler(400, "Email is required");
    }

    const findUser =
      await sql`SELECT user_id FROM users WHERE email = ${email}`;

    if (findUser.length === 0) {
      return res.json({
        message: "If that email exists, we have sent a reset link",
      });
    }

    const { token, tokenHash } = generateSecureToken();

    const user = findUser[0];
    const userId = user.user_id;

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);
    // console.log("expires_at:", expiresAt);

    await sql`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES
    (${userId}, ${tokenHash}, ${expiresAt})`;

    await sendForgotPassword(email, token);

    return res.status(200).json({
      message: "If that email exists, we have sent a reset link",
      // token: token, //Hồi comment lại
    });
  } catch (error) {
    throw error;
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    const { reset_password } = req.body;

    if (!token || typeof token !== "string") {
      throw new ErrorHandler(400, "Verification token is required");
    }

    if (!reset_password) {
      throw new ErrorHandler(400, "Please give password");
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const verifyToken =
      await sql`SELECT reset_id, user_id, token, expires_at, used FROM password_reset_tokens WHERE token = ${tokenHash}`;

    if (verifyToken.length === 0) {
      throw new ErrorHandler(400, "Invalid token");
    }

    const record = verifyToken[0];

    if (record.used) {
      throw new ErrorHandler(400, "Verification token has already been used");
    }

    if (new Date(record.expires_at) < new Date()) {
      throw new ErrorHandler(400, "Verification token has expired");
    }

    const passHash = await bcrypt.hash(reset_password, 10);

    await sql`UPDATE users SET password_hash = ${passHash} WHERE user_id = ${record.user_id}`;

    await sql`UPDATE password_reset_tokens SET used = true WHERE token = ${tokenHash} AND used = false`;

    res.status(200).json({
      message: "Reset password successfully",
    });
  } catch (error) {
    console.log(error);
    throw error;
  }
};

// RESET PASSWORD

// BEGIN
//  ↓
// UPDATE users
// SET password_hash = ...
//  ↓
// UPDATE password_reset_tokens
// SET used = true
//  ↓
// COMMIT nâng cấp bằng transaction kiểu này sau.