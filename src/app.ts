import express from "express";
import authRoute from "./routes/authRoute.js";
import projectRoute from "./routes/projectRoute.js";
import userRoute from "./routes/userRoute.js";
import mailRoute from "./routes/mailRoute.js";
import sql from "./config/db.js";
import cookieParser from "cookie-parser";
import uploadRoute from "./routes/uploadRoute.js";
import cors from "cors";
// GET = lấy/mở/xem
// POST = thực hiện một action làm thay đổi dữ liệu.

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:3001",
    credentials: true,
  }),
);

app.get("/", async (_req, res) => {
  try {
    const result = await sql.query("SELECT NOW()");

    res.json({
      message: "TaskFlow API is running",
      database_time: result,
    });
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(500).json({
      message: "Database connection failed",
    });
  }
});

app.use("/api/auth", authRoute);
app.use("/api/project", projectRoute);
app.use("/api/users", userRoute);
app.use("/api/mail", mailRoute);
app.use("/api/avatar", uploadRoute);

export default app;
