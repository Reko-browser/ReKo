import express from "express";
import "dotenv/config";
import { logger } from "./config/logger.js";
import cors from "cors";
import rateLimit from "express-rate-limit";

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Rate limiting for update checks
const updateCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many update check requests" },
});

// In-memory storage (use database in production)
let appVersions = {
  myapp: {
    currentVersion: "1.0.0",
    latestVersion: "1.2.0",
    releaseDate: "2024-12-01T10:00:00Z",
    downloadUrl: "https://releases.myapp.com/v1.2.0",
    releaseNotes: [
      "Added dark mode support",
      "Fixed memory leak in background sync",
      "Improved performance by 30%",
      "Security updates",
    ],
    critical: false,
    minimumVersion: "1.0.0",
    changelog: "https://myapp.com/changelog/v1.2.0",
  },
  "myapp-beta": {
    currentVersion: "1.2.0",
    latestVersion: "1.3.0-beta.1",
    releaseDate: "2024-12-15T14:30:00Z",
    downloadUrl: "https://releases.myapp.com/beta/v1.3.0-beta.1",
    releaseNotes: [
      "New experimental AI features",
      "Redesigned user interface",
      "Performance improvements",
    ],
    critical: false,
    minimumVersion: "1.2.0",
    changelog: "https://myapp.com/changelog/v1.3.0-beta.1",
  },
};

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

// Check for updates endpoint
app.get("/api/updates/check", updateCheckLimiter, (req, res) => {
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

  const appInfo = appVersions[appName];
  if (!appInfo) {
    return res.status(404).json({
      error: "Application not found",
      availableApps: Object.keys(appVersions),
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
app.get("/api/version/:app", (req, res) => {
  const appName = req.params.app || "myapp";
  const appInfo = appVersions[appName];

  if (!appInfo) {
    return res.status(404).json({
      error: "Application not found",
      availableApps: Object.keys(appVersions),
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
});

// Admin endpoint to publish new version
app.post("/api/admin/publish", express.json(), (req, res) => {
  const {
    app = "myapp",
    version,
    downloadUrl,
    releaseNotes,
    critical = false,
    minimumVersion,
  } = req.body;

  // Simple auth check (use proper auth in production)
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!version) {
    return res.status(400).json({ error: "Version is required" });
  }

  if (!appVersions[app]) {
    appVersions[app] = {};
  }

  const oldVersion = appVersions[app].latestVersion;

  appVersions[app] = {
    ...appVersions[app],
    latestVersion: version,
    releaseDate: new Date().toISOString(),
    downloadUrl: downloadUrl || appVersions[app].downloadUrl,
    releaseNotes: releaseNotes || [`Updated to version ${version}`],
    critical: critical,
    minimumVersion:
      minimumVersion || appVersions[app].minimumVersion || version,
  };

  logger.info(`New version published for ${app}: ${oldVersion} -> ${version}`);

  res.json({
    success: true,
    message: `Version ${version} published for ${app}`,
    publishedAt: appVersions[app].releaseDate,
    previousVersion: oldVersion,
  });
});

// Get update statistics
app.get("/api/admin/stats", (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  resetDailyStats();

  const versionDistribution = Array.from(updateStats.clientVersions.entries())
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totalChecks: updateStats.totalChecks,
    checksToday: updateStats.checksToday,
    lastReset: updateStats.lastReset,
    versionDistribution,
    availableApps: Object.keys(appVersions),
    uptime: process.uptime(),
  });
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
app.get("/api/apps", (req, res) => {
  const apps = Object.keys(appVersions).map((appName) => ({
    name: appName,
    latestVersion: appVersions[appName].latestVersion,
    releaseDate: appVersions[appName].releaseDate,
    critical: appVersions[appName].critical,
  }));

  res.json({ apps });
});

// Webhook endpoint for CI/CD integration
app.post("/api/webhook/release", express.json(), (req, res) => {
  const { repository, version, download_url, release_notes } = req.body;

  // Simple webhook validation (use proper signature validation in production)
  const webhookSecret = req.headers["x-webhook-secret"];
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const appName = repository?.name || "myapp";

  if (appVersions[appName]) {
    appVersions[appName].latestVersion = version;
    appVersions[appName].releaseDate = new Date().toISOString();
    appVersions[appName].downloadUrl = download_url;
    appVersions[appName].releaseNotes = release_notes || [`Release ${version}`];

    logger.info(`Webhook release update: ${appName} -> ${version}`);

    res.json({
      success: true,
      message: `Version ${version} updated via webhook`,
      app: appName,
    });
  } else {
    res.status(404).json({ error: "App not found" });
  }
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

app.listen(port, () => {
  logger.info(`Update server started on http://localhost:${port}`);
  logger.info(`Available apps: ${Object.keys(appVersions).join(", ")}`);
});
