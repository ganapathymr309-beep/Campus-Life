"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ATTENDANCE_STATUSES = ["Eligible", "Borderline", "Not Eligible"];
const ACADEMIC_STATUSES = ["Good", "Average", "Poor"];

function classifyAttendance(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
    throw new Error("Attendance must be a number from 0 to 100.");
  }
  const percentage = Number(value);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error("Attendance must be a number from 0 to 100.");
  }
  if (percentage >= 85) return "Eligible";
  if (percentage >= 75) return "Borderline";
  return "Not Eligible";
}

function classifyAcademic(marks) {
  if (!Array.isArray(marks)) throw new Error("Academic marks must be a list.");
  if (!marks.length) return { percentage: null, status: "Not available" };
  const scores = marks.map((mark) =>
    (typeof mark === "number" || (typeof mark === "string" && mark.trim() !== "")) ? Number(mark) : NaN
  );
  if (scores.some((score) => !Number.isFinite(score) || score < 0 || score > 100)) {
    throw new Error("Each academic mark must be a number from 0 to 100.");
  }
  const percentage = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return {
    percentage: Math.round((percentage + Number.EPSILON) * 100) / 100,
    status: percentage >= 85 ? "Good" : percentage >= 60 ? "Average" : "Poor"
  };
}

function evaluateStudent(student) {
  if (!student || typeof student !== "object") throw new Error("Student details are required.");
  const name = String(student.name || "").trim();
  const usn = String(student.usn || "").trim().toUpperCase();
  if (!name || !usn) throw new Error("Student name and USN are required.");
  const attendance = Number(student.attendance);
  const attendanceStatus = classifyAttendance(attendance);
  const marks = Array.isArray(student.marks) ? student.marks.slice() : student.marks;
  const academic = classifyAcademic(marks);
  return {
    name,
    usn,
    parentEmail: String(student.parentEmail || "").trim(),
    marks,
    attendance,
    attendanceStatus,
    academicPercentage: academic.percentage,
    academicStatus: academic.status
  };
}

function displayPercentage(value) {
  return value === null ? "Not available" : value.toFixed(1) + "%";
}

function explanation(category, metrics) {
  if (category === "attendance") {
    if (metrics.attendanceStatus === "Eligible") {
      return "Your child's attendance currently meets the institution's attendance eligibility requirement.";
    }
    if (metrics.attendanceStatus === "Borderline") {
      return "Your child's attendance is borderline. Please monitor attendance and ensure regular participation in classes.";
    }
    return "Your child's attendance is below the required eligibility level. Please contact the institution for further information.";
  }
  if (category === "academic") {
    if (metrics.academicStatus === "Good") {
      return "Your child's current academic performance is good. Keep encouraging this progress.";
    }
    if (metrics.academicStatus === "Average") {
      return "Your child's academic performance is average. Please monitor their progress and encourage consistent study.";
    }
    return "Your child's academic performance needs attention. Please discuss their progress and contact the institution if additional academic support is required.";
  }
  return "This update summarizes your child's current attendance and academic performance.";
}

function buildEmail(student, category, options) {
  const metrics = evaluateStudent(student);
  if (!(options && options.allowInvalidRecipient) && !EMAIL_PATTERN.test(metrics.parentEmail)) {
    throw new Error("The registered parent email address is invalid.");
  }
  const isAttendance = category === "attendance";
  const isAcademic = category === "academic";
  const subject = isAttendance
    ? metrics.attendanceStatus === "Eligible"
      ? "CampusCare – Student Attendance Update"
      : metrics.attendanceStatus === "Borderline"
        ? "CampusCare – Attendance Alert for Your Child"
        : "CampusCare – Important Attendance Warning"
    : isAcademic
      ? metrics.academicStatus === "Poor"
        ? "CampusCare – Academic Performance Alert"
        : "CampusCare – Academic Performance Update"
      : "CampusCare – Student Progress Update";
  const suggestion = isAttendance && metrics.attendanceStatus === "Not Eligible"
    ? "Please contact the institution for further information."
    : isAttendance && metrics.attendanceStatus === "Borderline"
      ? "We encourage you to monitor your child's attendance and ensure regular participation in classes. Please contact the institution if you have concerns."
      : isAcademic && metrics.academicStatus === "Poor"
        ? "We encourage you to discuss your child's academic progress and contact the institution if additional support is required."
        : isAcademic && metrics.academicStatus === "Average"
          ? "Please monitor your child's academic progress and contact the institution if you would like to discuss support."
          : isAcademic
            ? "Thank you for supporting your child's continued academic progress."
            : isAttendance
              ? "Your child's attendance meets the eligibility requirement. Please contact the institution if you have questions."
              : "Please contact the institution if you have questions or would like to discuss your child's progress.";
  const body = [
    "Dear Parent,",
    "",
    isAttendance
      ? "This is an update regarding your child's attendance."
      : isAcademic
        ? "We would like to bring your attention to your child's current academic performance."
        : "This is an update regarding your child's current progress.",
    "",
    "Student Name: " + metrics.name,
    "USN: " + metrics.usn,
    "Attendance: " + displayPercentage(metrics.attendance),
    "Attendance Classification: " + metrics.attendanceStatus,
    "Academic Performance: " + displayPercentage(metrics.academicPercentage),
    "Academic Performance Classification: " + metrics.academicStatus,
    "",
    explanation(category, metrics),
    "",
    suggestion,
    "",
    "Thank you,",
    "CampusCare Administration"
  ].join("\n");
  return {
    to: metrics.parentEmail,
    subject,
    text: body,
    metrics
  };
}

function createNotificationService(options) {
  const settings = options || {};
  const filePath = settings.filePath || path.join(__dirname, ".campuscare", "notifications.json");
  const mode = settings.mode || "console";
  const sendMail = settings.sendMail || (async () => {
    if (mode === "console") {
      console.info("[CampusCare test mode] An email was captured; no delivery was attempted.");
      return { status: "test", deliveryResult: "No email sent; test mode is enabled." };
    }
    throw new Error("Email provider is not configured. Configure RESEND_API_KEY and EMAIL_FROM.");
  });
  let state;
  let queue = Promise.resolve();

  function loadState() {
    if (!state) {
      try {
        state = fs.existsSync(filePath)
          ? JSON.parse(fs.readFileSync(filePath, "utf8"))
          : { snapshots: {}, notifications: [] };
      } catch (error) {
        throw new Error("Could not read notification history: " + error.message);
      }
      if (!state || typeof state !== "object" || !state.snapshots || !Array.isArray(state.notifications)) {
        throw new Error("Notification history has an invalid format.");
      }
    }
    return state;
  }

  function persist() {
    const data = loadState();
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = filePath + ".tmp";
    fs.writeFileSync(temporaryPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
  }

  function exclusive(operation) {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  }

  async function deliver(record) {
    record.status = "sending";
    record.deliveryResult = "Delivery attempt in progress.";
    record.attempts = Array.isArray(record.attempts) ? record.attempts : [];
    record.attempts.push({ date: new Date().toISOString(), status: "sending", result: record.deliveryResult });
    persist();
    try {
      if (!EMAIL_PATTERN.test(record.parentEmail)) {
        throw new Error("The registered parent email address is invalid.");
      }
      const result = await sendMail({ to: record.parentEmail, subject: record.subject, text: record.body });
      record.status = result.status || "sent";
      record.deliveryResult = result.deliveryResult || "Accepted by the configured email transport.";
      record.sentAt = record.status === "sent" ? new Date().toISOString() : null;
      record.attempts[record.attempts.length - 1] = {
        date: record.attempts[record.attempts.length - 1].date,
        status: record.status,
        result: record.deliveryResult
      };
    } catch (error) {
      record.status = "failed";
      record.deliveryResult = error.message || "Email delivery failed.";
      record.sentAt = null;
      record.attempts[record.attempts.length - 1] = {
        date: record.attempts[record.attempts.length - 1].date,
        status: "failed",
        result: record.deliveryResult
      };
    }
    record.date = new Date().toISOString();
    persist();
    return record;
  }

  function makeRecord(metrics, category) {
    const email = buildEmail(metrics, category, { allowInvalidRecipient: true });
    return {
      id: crypto.randomUUID(),
      usn: metrics.usn,
      studentName: metrics.name,
      parentEmail: metrics.parentEmail,
      category,
      date: new Date().toISOString(),
      status: "queued",
      deliveryResult: "Waiting for delivery.",
      attendancePercentage: metrics.attendance,
      attendanceStatus: metrics.attendanceStatus,
      academicPercentage: metrics.academicPercentage,
      academicStatus: metrics.academicStatus,
      subject: email.subject,
      body: email.text,
      attempts: []
    };
  }

  async function synchronize(students) {
    return exclusive(() => {
      if (!Array.isArray(students)) throw new Error("Students must be provided as a list.");
      const data = loadState();
      let added = 0;
      students.forEach((student) => {
        const metrics = evaluateStudent(student);
        const key = metrics.usn.toLowerCase();
        if (!data.snapshots[key]) {
          data.snapshots[key] = {
            attendanceStatus: metrics.attendanceStatus,
            academicStatus: metrics.academicStatus
          };
          added += 1;
        }
      });
      if (added) persist();
      return { baselined: added };
    });
  }

  async function evaluate(student) {
    return exclusive(async () => {
      const metrics = evaluateStudent(student);
      const key = metrics.usn.toLowerCase();
      const data = loadState();
      const previous = data.snapshots[key];
      data.snapshots[key] = {
        attendanceStatus: metrics.attendanceStatus,
        academicStatus: metrics.academicStatus
      };
      if (!previous) {
        persist();
        return { metrics, notifications: [], baselined: true };
      }
      const changed = [];
      if (previous.attendanceStatus !== metrics.attendanceStatus) changed.push("attendance");
      if (previous.academicStatus !== metrics.academicStatus) changed.push("academic");
      const records = changed.map((category) => makeRecord(metrics, category));
      data.notifications.push(...records);
      persist();
      for (const record of records) await deliver(record);
      return { metrics, notifications: records, baselined: false };
    });
  }

  async function manual(student) {
    return exclusive(async () => {
      const metrics = evaluateStudent(student);
      const record = makeRecord(metrics, "manual");
      const data = loadState();
      data.notifications.push(record);
      persist();
      await deliver(record);
      return record;
    });
  }

  async function retry(id) {
    return exclusive(async () => {
      const record = loadState().notifications.find((item) => item.id === id);
      if (!record) throw new Error("Notification was not found.");
      if (record.status !== "failed") throw new Error("Only failed notifications can be retried.");
      return deliver(record);
    });
  }

  function preview(student) {
    return buildEmail(student, "manual");
  }

  function history(failedOnly) {
    const notifications = loadState().notifications.slice().sort((left, right) =>
      new Date(right.date) - new Date(left.date)
    );
    return failedOnly ? notifications.filter((item) => item.status === "failed") : notifications;
  }

  return {
    classifyAttendance,
    classifyAcademic,
    evaluateStudent,
    synchronize,
    evaluate,
    manual,
    retry,
    preview,
    history
  };
}

module.exports = {
  ATTENDANCE_STATUSES,
  ACADEMIC_STATUSES,
  classifyAttendance,
  classifyAcademic,
  evaluateStudent,
  buildEmail,
  createNotificationService
};
