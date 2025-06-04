import express from "express";
import "dotenv/config";
import logger from "./config/logger.js";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "..", "client", "build")));

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request at ${req.url}`);
  next();
});

app.use((req, res, next) => {
  const components = [
    req.ip,
    req.headers["user-agent"],
    req.headers["accept-language"],
    req.headers["accept-encoding"],
    // Add more stable identifiers if available
    req.headers["x-forwarded-for"]?.split(",")[0], // Real IP behind proxy
    req.headers["sec-ch-ua-platform"], // Platform info
  ].filter(Boolean); // Remove undefined values

  const id = crypto
    .createHash("sha256")
    .update(components.join("|"))
    .digest("hex");

  req.uniqueId = id;
  res.locals.uniqueId = id;
  next();
});

app.use("/admin", (req, res, next) => {
  // Protect admin route
  if (req.headers["x-admin-password"] !== process.env.ADMIN_PASSWORD) {
    return res.redirect(
      `/?message=${encodeURIComponent(
        "You are not allowed to access this page."
      )}&type=error`
    );
  }
  next();
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "build", "index.html"));
});

app.listen(port, () => {
  logger.info(`Website server started on http://localhost:${port}`);
});
