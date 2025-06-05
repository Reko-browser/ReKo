const express = require("express");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

try {
  require("dotenv").config();
} catch (error) {
  console.error("Error loading environment variables:", error);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "temp-uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static("public"));

// GitHub configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Webhook endpoint to trigger GitHub Actions
app.post("/trigger-release", upload.array("files"), async (req, res) => {
  try {
    const {
      version,
      platform = "universal",
      release_notes = "Automated release via webhook",
      callback_url,
    } = req.body;

    if (!version) {
      return res.status(400).json({ error: "Version is required" });
    }

    let files_url = "";

    // If files were uploaded, we need to make them accessible
    if (req.files && req.files.length > 0) {
      // In production, upload these to a temporary public location
      // For now, we'll create a simple file listing
      const fileList = req.files.map((file) => ({
        name: file.originalname,
        path: file.path,
        size: file.size,
      }));

      console.log("Files uploaded:", fileList);

      // You could upload these to S3, GitHub, or another temporary storage
      // For this example, we'll assume files are already accessible via URL
      files_url = req.body.files_url || "";
    }

    // Prepare the webhook payload
    const payload = {
      event_type: "build-release",
      client_payload: {
        version,
        platform,
        release_notes,
        files_url,
        callback_url,
        timestamp: new Date().toISOString(),
        trigger_id: crypto.randomUUID(),
      },
    };

    // Trigger GitHub Actions workflow
    const githubUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;

    const response = await axios.post(githubUrl, payload, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
    });

    // Clean up uploaded files after a delay
    if (req.files && req.files.length > 0) {
      setTimeout(() => {
        req.files.forEach((file) => {
          fs.unlink(file.path, (err) => {
            if (err) console.error("Error deleting file:", err);
          });
        });
      }, 60000); // Delete after 1 minute
    }

    res.json({
      success: true,
      message: "Release workflow triggered successfully",
      trigger_id: payload.client_payload.trigger_id,
      version: version,
      github_response_status: response.status,
    });
  } catch (error) {
    console.error("Error triggering release:", error);
    res.status(500).json({
      error: "Failed to trigger release",
      details: error.response?.data || error.message,
    });
  }
});

// Endpoint to check release status
app.get("/release-status/:version", async (req, res) => {
  try {
    const version = req.params.version;

    const githubUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${version}`;

    const response = await axios.get(githubUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const release = response.data;

    res.json({
      exists: true,
      version: release.tag_name,
      name: release.name,
      published_at: release.published_at,
      html_url: release.html_url,
      assets: release.assets.map((asset) => ({
        name: asset.name,
        size: asset.size,
        download_count: asset.download_count,
        browser_download_url: asset.browser_download_url,
      })),
    });
  } catch (error) {
    if (error.response?.status === 404) {
      res.json({ exists: false });
    } else {
      res.status(500).json({ error: "Failed to check release status" });
    }
  }
});

// List all releases
app.get("/releases", async (req, res) => {
  try {
    const githubUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

    const response = await axios.get(githubUrl, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const releases = response.data.map((release) => ({
      version: release.tag_name,
      name: release.name,
      published_at: release.published_at,
      html_url: release.html_url,
      assets_count: release.assets.length,
      total_downloads: release.assets.reduce(
        (sum, asset) => sum + asset.download_count,
        0
      ),
    }));

    res.json(releases);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch releases" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    github_configured: !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO),
  });
});

app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(
    `GitHub configured: ${!!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO)}`
  );
});
