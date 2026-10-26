import sql from "../config/db.js";
import ErrorHandler from "../config/errorHandler.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import jwt from "jsonwebtoken";
import { generateSecureToken } from "../utils/generateSecureToken.js";
import { sendVerificationEmail } from "../utils/sendVerificationEmail.js";

dotenv.config();

//jwt và cookie thì vẫn lưu và so sánh bằng token chưa băm

const registerController = async (req: Request, res: Response) => {
  try {
    const { name, email, password, redirectUrl  } = req.body;

    if (!name || !email || !password) {
      throw new ErrorHandler(400, "Please give all details");
    }

    const emailLowerCase = req.body.email.toLowerCase().trim();

    const existUser =
      await sql`SELECT email FROM users WHERE email = ${emailLowerCase}`;

    if (existUser.length > 0) {
      throw new ErrorHandler(409, "User with this email already exists");
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const user = await sql`INSERT INTO users (name, email, password_hash) VALUES
  (${name},${emailLowerCase},${hashPassword}) RETURNING 
  user_id, name, email, created_at`;

    const registerdUser = user[0];

    const { token, tokenHash } = generateSecureToken();

    //Hết hạn sau 15p: xem kỹ lại phần này------------
    //Thoi gian hien tai: vd 11:43:30
    const expiresAt = new Date();
    //đặt phút của expiresAt thành phút thứ 15 sau phút hiện tại của expiresAt
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    await sql`INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES 
    (${registerdUser.user_id},${tokenHash}, ${expiresAt})`;

    await sendVerificationEmail(registerdUser.email, token, redirectUrl);

    //Trả về một promise thì luôn luôn await để lấy kết quả
    // const accessToken = await generateAccessToken(registerdUser.user_id);

    // console.log("accessToken", accessToken);

    res.status(201).json({
      message: "If this email exists, we have sent a verification link",
      // userData: {
      //   registerdUser: registerdUser,
      // },
      // token: token, //Hồi comment lại
    });
  } catch (error) {
    console.error("Register error:", error);

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

const loginController = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new ErrorHandler(400, "Please give all details");
    }

    const emailLowerCase = req.body.email.toLowerCase().trim();
    const existUser =
      await sql`SELECT user_id, email, password_hash, email_verified FROM users WHERE email = ${emailLowerCase}`;

    if (existUser.length > 0) {
      const isValid = await bcrypt.compare(
        password,
        existUser[0].password_hash,
      );
      if (!isValid) {
        return res.status(401).json({
          message: "Invalid Password",
        });
      }

      if (!existUser[0].email_verified) {
        throw new ErrorHandler(400, "Please verify your email first");
      }

      const accessToken = await generateAccessToken(existUser[0].user_id);
      const refreshToken = await generateRefreshToken(existUser[0].user_id);
      const expiredToken = refreshToken.expiredAt;
      const tokenRefresh = refreshToken.token;

      const tokenHash = crypto
        //SHA-256 là thuật toán băm xác định (Deterministic).
        //Nghĩa là một token dù có bị băm ở chỗ khác
        //thì cùng 1 token sau khi băm sẽ luôn luôn ra cùng 1 kết quả
        .createHash("sha256")
        .update(tokenRefresh)
        .digest("hex");

      const updateRefreshToken =
        await sql`INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES
      (${existUser[0].user_id}, ${tokenHash}, ${expiredToken}) RETURNING
      token_id, user_id, token, expires_at, created_at`;

      res.cookie("refreshToken", tokenRefresh, {
        httpOnly: true,
        //secure: true yêu cầu cookie chỉ được gửi qua HTTPS connection.
        //nếu chạy localhost thì secure: true sẽ không lưu cookie
        //nên để false để test trước đã
        secure: false,
      });

      // console.log("cookie", cookie);
      // console.log("refreshToken", refreshToken.token)

      return res.status(200).json({
        message: "Login Successfully!",
        // userData: {
        // user: existUser[0],
        accessToken: accessToken, //Hồi comment lại
        // refreshToken: refreshToken.token,
        // expiredAt: refreshToken.expiredAt,
        // },
      });
    } else {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }
  } catch (error) {
    console.error("Login error:", error);

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

const refreshController = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
  // console.log(refreshToken)
  try {
    if (!refreshToken) {
      throw new ErrorHandler(403, "Token is empty");
    }
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const userId =
      await sql`SELECT user_id, is_revoked FROM refresh_tokens WHERE token = ${tokenHash}`;
    if (userId.length === 0 || userId[0].is_revoked) {
      throw new ErrorHandler(403, "Invalid token");
    }
    // console.log("UserId từ refreshController: ", userId[0].user_id);

    //Đúng refresh token của user đó thì mới tạo access token mới
    //Còn lỗi thì báo lại lỗi thôi
    jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET as string,
      // async (error: any) => {
      //   if (error) {
      //     throw new ErrorHandler(403, "Invalid token");
      //   }
      //}
    );
    const token = await generateAccessToken(userId[0].user_id);
    // console.log("Token từ refreshController: ", token);
    res.json({
      message: "Generate access token successfully",
      accessToken: token,
    });
  } catch (error) {
    console.error("Refresh token error:", error);

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

const logoutController = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      throw new ErrorHandler(403, "Token is empty");
    }
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const user =
      await sql`SELECT user_id FROM refresh_tokens WHERE token = ${tokenHash}`;
    // console.log("userId: ", user);
    if (user.length > 0) {
      const update =
        await sql`UPDATE refresh_tokens SET is_revoked = true WHERE token = ${tokenHash}`;
      // console.log("update: ", update);
    }

    res.clearCookie("refreshToken");
    return res.status(200).json({ message: "Logout successfully" });
  } catch (error) {
    console.error("Logout error:", error);

    if (error instanceof ErrorHandler) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }
    res.clearCookie("refreshToken");

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

export {
  registerController,
  loginController,
  refreshController,
  logoutController,
};
