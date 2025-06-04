import express from "express";
import "dotenv/config";
import { logger } from "./config/logger.js";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { AppVersion } from "./models/AppVersion.js";
import mongoose from "mongoose";

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    logger.info("Connected to MongoDB");
  })
  .catch((err) => {
    logger.error("MongoDB connection error:", err);
  });

// Rate limiting for update checks
const updateCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many update check requests" },
});

// Update check statistics
let updateStats = {
  totalChecks: 0,
  checksToday: 0,
  lastReset: new Date().toDateString(),
  clientVersions: new Map(),
};

// Reset daily stats
function resetDailyStats() {
  const today = new Date().toDateString();
  if (updateStats.lastReset !== today) {
    updateStats.checksToday = 0;
    updateStats.lastReset = today;
    logger.info("Daily update check stats reset");
  }
}

// Helper function to compare versions
function compareVersions(version1, version2) {
  const v1parts = version1.split(/[.-]/).map((x) => parseInt(x) || 0);
  const v2parts = version2.split(/[.-]/).map((x) => parseInt(x) || 0);

  const maxLength = Math.max(v1parts.length, v2parts.length);

  for (let i = 0; i < maxLength; i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;

    if (v1part < v2part) return -1;
    if (v1part > v2part) return 1;
  }

  return 0;
}

app.head("/", (req, res) => {
  res.status(200).json({
    statusCode: 200,
    message: "Im Up",
  });
});

// Check for updates endpoint
app.get("/api/updates/check", updateCheckLimiter, async (req, res) => {
  resetDailyStats();

  const {
    app: appName = "myapp",
    version: currentVersion,
    platform,
    arch,
  } = req.query;

  // Track statistics
  updateStats.totalChecks++;
  updateStats.checksToday++;

  if (currentVersion) {
    const count = updateStats.clientVersions.get(currentVersion) || 0;
    updateStats.clientVersions.set(currentVersion, count + 1);
  }

  logger.info(
    `Update check: app=${appName}, version=${currentVersion}, platform=${platform}, ip=${req.ip}`
  );

  const appInfo = await AppVersion.findOne({ app: appName });

  if (!appInfo) {
    return res.status(404).json({
      error: "Application not found",
      availableApps: Object.keys(await AppVersion.find()),
    });
  }

  if (!currentVersion) {
    return res.status(400).json({
      error: "Current version is required",
      example: "/api/updates/check?app=myapp&version=1.0.0",
    });
  }

  const updateAvailable =
    compareVersions(currentVersion, appInfo.latestVersion) < 0;
  const isCritical =
    appInfo.critical &&
    compareVersions(currentVersion, appInfo.minimumVersion) < 0;

  const response = {
    updateAvailable,
    critical: isCritical,
    currentVersion,
    latestVersion: appInfo.latestVersion,
    releaseDate: appInfo.releaseDate,
    downloadUrl: updateAvailable ? appInfo.downloadUrl : null,
    releaseNotes: updateAvailable ? appInfo.releaseNotes : null,
    changelog: updateAvailable ? appInfo.changelog : null,
    minimumVersion: appInfo.minimumVersion,
    checkedAt: new Date().toISOString(),
    platform: platform || "unknown",
    arch: arch || "unknown",
  };

  if (updateAvailable) {
    logger.info(
      `Update available for ${appName}: ${currentVersion} -> ${appInfo.latestVersion}`
    );
  }

  res.json(response);
});

// Get version info endpoint
app.get("/api/version/:app", async (req, res) => {
  const appName = req.params.app;

  try {
    const appInfo = await AppVersion.findOne({ app: appName });
    if (!appInfo) {
      const apps = await AppVersion.find({}, "app");
      return res.status(404).json({
        error: "Application not found",
        availableApps: apps.map((a) => a.app),
      });
    }

    res.json({
      app: appName,
      version: appInfo.latestVersion,
      releaseDate: appInfo.releaseDate,
      downloadUrl: appInfo.downloadUrl,
      releaseNotes: appInfo.releaseNotes,
      minimumVersion: appInfo.minimumVersion,
      critical: appInfo.critical,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
  });
});

// List all available apps
app.get("/api/apps", async (req, res) => {
  try {
    const apps = await AppVersion.find(
      {},
      "app latestVersion releaseDate critical"
    );
    res.json({ apps });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to fetch apps", details: err.message });
  }
});

// Webhook endpoint for CI/CD integration
app.post("/api/webhook/release", express.json(), async (req, res) => {
  const { repository, version, download_url, release_notes } = req.body;

  // Simple webhook validation (use proper signature validation in production)
  const webhookSecret = req.headers["x-webhook-secret"];
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const appName = repository?.name || "myapp";
  let appInfo = await AppVersion.findOne({ app: appName });

  if (!appInfo) {
    appInfo = new AppVersion({ app: appName });
  }

  appInfo.latestVersion = version;
  appInfo.releaseDate = new Date();
  appInfo.downloadUrl = download_url;
  appInfo.releaseNotes = release_notes || [`Release ${version}`];

  await appInfo.save();

  res.json({
    success: true,
    message: `Version ${version} updated via webhook`,
    app: appName,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Server error:", err);
  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    availableEndpoints: [
      "GET /api/updates/check?app=myapp&version=1.0.0",
      "GET /api/version/myapp",
      "GET /api/apps",
      "GET /health",
      "POST /api/admin/publish",
      "GET /api/admin/stats",
    ],
  });
});

app.listen(port, async () => {
  logger.info(`Update server started on http://localhost:${port}`);
  logger.info(
    `Available apps: ${Object.keys(await AppVersion.find()).join(", ")}`
  );
});
