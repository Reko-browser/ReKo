import nodeloggerg from "nodeloggerg";

export const logger = nodeloggerg({
  serverConfig: {
    startWebServer: true,
    auth: {
      user: "admin",
      pass: "admin",
    },
    authEnabled: true,
    enableRealtime: true,
    enableSearch: true,
  },
  enableMetrics: true,
  compressOldLogs: true,
});
