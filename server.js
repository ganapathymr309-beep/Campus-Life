"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createNotificationService } = require("./notification-service");

function loadEnvironment(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) return;
    const separator = entry.indexOf("=");
    if (separator < 1) return;
    const key = entry.slice(0, separator).trim();
    let value = entry.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
}

loadEnvironment(path.join(__dirname, ".env"));
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const EMAIL_FIELDS = ["RESEND_API_KEY", "EMAIL_FROM"];
const EMAIL_MODE = process.env.EMAIL_MODE || "console";
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT must be a valid TCP port.");
if (!["console", "resend"].includes(EMAIL_MODE)) throw new Error("EMAIL_MODE must be either console or resend.");

const missingEmailFields = EMAIL_FIELDS.filter((field) => !process.env[field]);
const providerConfigured = EMAIL_MODE === "resend" && missingEmailFields.length === 0;

const service = createNotificationService({
  mode: EMAIL_MODE,
  sendMail: async (message) => {
    if (EMAIL_MODE === "console") {
      console.info("[CampusCare test mode] An email was captured; no delivery was attempted.");
      return { status: "test", deliveryResult: "No email sent; test mode is enabled." };
    }
    if (!providerConfigured) {
      throw new Error("Email provider is not configured. Missing environment variable(s): " + missingEmailFields.join(", ") + ".");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text
      }),
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || "Email provider returned HTTP " + response.status + ".");
    }
    return {
      status: "sent",
      deliveryResult: "Accepted by email provider" + (result.id ? " (message " + result.id + ")." : ".")
    };
  }
});

function sendJson(response, statusCode, value, origin) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {})
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body exceeds the 1 MB limit."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon"
  }[extension] || "application/octet-stream";
}

function serveStatic(request, response) {
  let requested;
  try {
    requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }
  if (requested === "/") requested = "/index.html";
  const normalized = path.normalize(requested).replace(/^([/\\])+/, "");
  const filePath = path.resolve(ROOT, normalized);
  const allowedDependency = normalized.replace(/\\/g, "/") === "node_modules/xlsx/dist/xlsx.full.min.js";
  if (!filePath.startsWith(ROOT + path.sep) || (!allowedDependency && normalized.split(/[\\/]/).some((part) => part.startsWith("."))) ||
      (!allowedDependency && normalized.split(/[\\/]/)[0] === "node_modules")) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, error.code === "ENOENT" ? 404 : 500, { error: error.code === "ENOENT" ? "Not found." : "Could not read the requested file." });
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store"
    });
    response.end(content);
  });
}

function createServer(options) {
  const activeService = options && options.service ? options.service : service;
  return http.createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      sendJson(response, 403, { error: "This local CampusCare server does not allow requests from this origin." });
      return;
    }
    const corsOrigin = origin || "";
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
        ...(corsOrigin ? { "Access-Control-Allow-Origin": corsOrigin, "Vary": "Origin" } : {})
      });
      response.end();
      return;
    }

    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        sendJson(response, 200, {
          emailMode: EMAIL_MODE,
          providerConfigured,
          missingEmailFields: EMAIL_MODE === "resend" ? missingEmailFields : [],
          message: EMAIL_MODE === "console"
            ? "Test mode is active; email messages are recorded but not delivered."
            : providerConfigured
              ? "Email provider is configured. Delivery will be attempted when a status changes."
              : "Email provider mode is active but configuration is incomplete."
        }, corsOrigin);
        return;
      }
      if (url.pathname === "/api/notifications" && request.method === "GET") {
        sendJson(response, 200, { notifications: activeService.history(url.searchParams.get("failedOnly") === "true") }, corsOrigin);
        return;
      }
      if (url.pathname === "/api/notifications/sync" && request.method === "POST") {
        const body = await readJson(request);
        sendJson(response, 200, await activeService.synchronize(body.students), corsOrigin);
        return;
      }
      if (url.pathname === "/api/notifications/evaluate" && request.method === "POST") {
        const body = await readJson(request);
        sendJson(response, 200, await activeService.evaluate(body.student), corsOrigin);
        return;
      }
      if (url.pathname === "/api/notifications/preview" && request.method === "POST") {
        const body = await readJson(request);
        sendJson(response, 200, activeService.preview(body.student), corsOrigin);
        return;
      }
      if (url.pathname === "/api/notifications/manual" && request.method === "POST") {
        const body = await readJson(request);
        sendJson(response, 200, { notification: await activeService.manual(body.student) }, corsOrigin);
        return;
      }
      const retryMatch = url.pathname.match(/^\/api\/notifications\/([0-9a-f-]+)\/retry$/i);
      if (retryMatch && request.method === "POST") {
        sendJson(response, 200, { notification: await activeService.retry(retryMatch[1]) }, corsOrigin);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        sendJson(response, 404, { error: "API endpoint not found." }, corsOrigin);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, { error: "Method not allowed." }, corsOrigin);
        return;
      }
      serveStatic(request, response);
    } catch (error) {
      const status = error.message.includes("not found") ? 404 : error.message.includes("required") || error.message.includes("must") || error.message.includes("invalid") ? 400 : 500;
      sendJson(response, status, { error: error.message || "The request could not be completed." }, corsOrigin);
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.info("CampusCare is available at http://" + HOST + ":" + PORT + "/");
    console.info("Email mode: " + (EMAIL_MODE === "console" ? "test (no email delivery)" : providerConfigured ? "Resend API" : "email provider not configured"));
    if (EMAIL_MODE === "resend" && !providerConfigured) {
      console.warn("Missing email provider environment variable(s): " + missingEmailFields.join(", "));
    }
  });
}

module.exports = { createServer };
