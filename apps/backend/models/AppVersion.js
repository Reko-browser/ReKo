import mongoose from "mongoose";

const appVersionSchema = new mongoose.Schema(
  {
    app: { type: String, required: true, unique: true },
    latestVersion: { type: String, required: true },
    releaseDate: { type: Date, required: true },
    downloadUrl: { type: String, required: true },
    releaseNotes: { type: [String], default: [] },
    critical: { type: Boolean, default: false },
    minimumVersion: { type: String, required: true },
    changelog: { type: String },
  },
  { timestamps: true }
);

export const AppVersion = mongoose.model("AppVersion", appVersionSchema);
