"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  classifyAttendance,
  classifyAcademic,
  buildEmail,
  createNotificationService
} = require("../notification-service");
const { createServer } = require("../server");

function sample(overrides) {
  return Object.assign({
    name: "Sample Student",
    usn: "CCS2024001",
    parentEmail: "parent@example.edu",
    attendance: 90,
    marks: [90, 90, 90, 90, 90]
  }, overrides || {});
}

function temporaryStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campuscare-notifications-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, "notifications.json");
}

test("classifies attendance thresholds exactly", () => {
  assert.equal(classifyAttendance(90), "Eligible");
  assert.equal(classifyAttendance(85), "Eligible");
  assert.equal(classifyAttendance(80), "Borderline");
  assert.equal(classifyAttendance(75), "Borderline");
  assert.equal(classifyAttendance(70), "Not Eligible");
});

test("classifies the average of all existing subject marks", () => {
  assert.equal(classifyAcademic([90]).status, "Good");
  assert.equal(classifyAcademic([85]).status, "Good");
  assert.equal(classifyAcademic([90, 90, 90, 90, 90]).percentage, 90);
  assert.equal(classifyAcademic([70, 70, 70, 70, 70]).status, "Average");
  assert.equal(classifyAcademic([60]).status, "Average");
  assert.equal(classifyAcademic([59.99]).status, "Poor");
  assert.equal(classifyAcademic([50, 50, 50, 50, 50]).status, "Poor");
  assert.equal(classifyAcademic([]).status, "Not available");
});

test("email templates include current performance, explanation, and parent contact suggestion", () => {
  const attendance = buildEmail(sample({ attendance: 80 }), "attendance");
  assert.equal(attendance.to, "parent@example.edu");
  assert.match(attendance.subject, /Attendance Alert/);
  assert.match(attendance.text, /Student Name: Sample Student/);
  assert.match(attendance.text, /USN: CCS2024001/);
  assert.match(attendance.text, /Attendance: 80\.0%/);
  assert.match(attendance.text, /Attendance Classification: Borderline/);
  assert.match(attendance.text, /Academic Performance: 90\.0%/);
  assert.match(attendance.text, /Academic Performance Classification: Good/);
  assert.match(attendance.text, /contact the institution/i);

  assert.match(buildEmail(sample({ marks: [50, 50, 50, 50, 50] }), "academic").subject, /Academic Performance Alert/);
  assert.match(buildEmail(sample({ marks: [70, 70, 70, 70, 70] }), "academic").text, /Status: Average|Classification: Average/);
  assert.match(buildEmail(sample({ marks: [90, 90, 90, 90, 90] }), "academic").text, /Classification: Good/);
});

test("baseline synchronization and classification transitions prevent duplicate emails", async (t) => {
  const delivered = [];
  const filePath = temporaryStore(t);
  const service = createNotificationService({
    filePath,
    sendMail: async (message) => {
      delivered.push(message);
      return { status: "sent", deliveryResult: "Accepted by test SMTP." };
    }
  });
  const initial = sample();
  await service.synchronize([initial]);
  assert.equal((await service.evaluate(initial)).notifications.length, 0);

  const borderline = sample({ attendance: 80 });
  const attendanceChange = await service.evaluate(borderline);
  assert.equal(attendanceChange.notifications.length, 1);
  assert.equal(attendanceChange.notifications[0].category, "attendance");
  assert.equal(delivered[0].to, "parent@example.edu");
  assert.equal((await service.evaluate(borderline)).notifications.length, 0);

  const average = sample({ attendance: 80, marks: [70, 70, 70, 70, 70] });
  const academicChange = await service.evaluate(average);
  assert.equal(academicChange.notifications.length, 1);
  assert.equal(academicChange.notifications[0].category, "academic");

  const poor = sample({ attendance: 80, marks: [50, 50, 50, 50, 50] });
  const poorChange = await service.evaluate(poor);
  assert.equal(poorChange.notifications[0].academicStatus, "Poor");
  assert.equal(delivered.length, 3);
  assert.equal(service.history().length, 3);

  const restartedService = createNotificationService({
    filePath,
    sendMail: async () => { throw new Error("Unchanged classifications must not send."); }
  });
  assert.equal((await restartedService.evaluate(poor)).notifications.length, 0);
});

test("invalid parent emails are recorded as failed without calling the mail transport", async (t) => {
  let sendCount = 0;
  const service = createNotificationService({
    filePath: temporaryStore(t),
    sendMail: async () => { sendCount += 1; }
  });
  await service.synchronize([sample()]);
  const result = await service.evaluate(sample({ attendance: 70, parentEmail: "not-an-email" }));
  assert.equal(sendCount, 0);
  assert.equal(result.notifications[0].status, "failed");
  assert.match(result.notifications[0].deliveryResult, /invalid/i);
  assert.equal(service.history(true).length, 1);
  assert.throws(() => service.preview(sample({ parentEmail: "not-an-email" })), /invalid/i);
});

test("failed delivery can be retried and records both attempts", async (t) => {
  let sendCount = 0;
  const service = createNotificationService({
    filePath: temporaryStore(t),
    sendMail: async () => {
      sendCount += 1;
      if (sendCount === 1) throw new Error("Temporary SMTP outage.");
      return { status: "sent", deliveryResult: "Accepted after retry." };
    }
  });
  await service.synchronize([sample()]);
  const result = await service.evaluate(sample({ attendance: 70 }));
  const failed = result.notifications[0];
  assert.equal(failed.status, "failed");
  assert.match(failed.deliveryResult, /SMTP outage/);

  const retried = await service.retry(failed.id);
  assert.equal(retried.status, "sent");
  assert.equal(retried.attempts.length, 2);
  assert.equal(service.history(true).length, 0);
});

test("preview and manual sends use the registered parent email", async (t) => {
  const delivered = [];
  const student = sample({ parentEmail: "registered.parent@example.edu" });
  const service = createNotificationService({
    filePath: temporaryStore(t),
    sendMail: async (message) => {
      delivered.push(message);
      return { status: "sent", deliveryResult: "Accepted." };
    }
  });
  assert.equal(service.preview(student).to, student.parentEmail);
  const sent = await service.manual(student);
  assert.equal(sent.status, "sent");
  assert.equal(delivered[0].to, "registered.parent@example.edu");
  assert.match(delivered[0].text, /Academic Performance Classification: Good/);
});

test("HTTP API exposes previews and records automatic status updates", async (t) => {
  const service = createNotificationService({
    filePath: temporaryStore(t),
    sendMail: async () => ({ status: "sent", deliveryResult: "Accepted by API test SMTP." })
  });
  const server = createServer({ service });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const baseUrl = "http://127.0.0.1:" + server.address().port;

  const health = await fetch(baseUrl + "/api/health");
  assert.equal(health.status, 200);
  const allowedOrigin = await fetch(baseUrl + "/api/health", {
    headers: { Origin: "http://localhost:5500" }
  });
  assert.equal(allowedOrigin.headers.get("access-control-allow-origin"), "http://localhost:5500");
  const blockedOrigin = await fetch(baseUrl + "/api/health", {
    headers: { Origin: "http://untrusted.example" }
  });
  assert.equal(blockedOrigin.status, 403);
  const baseline = await fetch(baseUrl + "/api/notifications/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ students: [sample()] })
  });
  assert.equal(baseline.status, 200);
  const preview = await fetch(baseUrl + "/api/notifications/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student: sample() })
  });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).to, "parent@example.edu");
  const invalidPreview = await fetch(baseUrl + "/api/notifications/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student: sample({ parentEmail: "not-an-email" }) })
  });
  assert.equal(invalidPreview.status, 400);

  const changed = await fetch(baseUrl + "/api/notifications/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ student: sample({ attendance: 80 }) })
  });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).notifications[0].status, "sent");
  const history = await fetch(baseUrl + "/api/notifications");
  assert.equal((await history.json()).notifications.length, 1);
});
