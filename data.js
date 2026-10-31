(function () {
  "use strict";

  const STORAGE = {
    students: "campuscare.students.v1",
    studentAccounts: "campuscare.student-accounts.v1",
    notifications: "campuscare.notifications.v1",
    session: "campuscare.session.v1"
  };
  const PASSWORD_ITERATIONS = 210000;

  const seedStudents = [
    {
      id: "CC-1001", name: "Aarav Rao", usn: "CCS2024001", email: "aarav.rao@example.edu",
      phone: "9000000101", fatherName: "Rohan Rao", fatherPhone: "9000000201",
      motherName: "Meera Rao", motherPhone: "9000000301", parentEmail: "parent.rao@example.edu",
      marks: [88, 92, 81, 86, 90], attendance: 94, behavior: "Excellent", performance: "Excellent"
    },
    {
      id: "CC-1002", name: "Diya Nair", usn: "CCS2024002", email: "diya.nair@example.edu",
      phone: "9000000102", fatherName: "Arun Nair", fatherPhone: "9000000202",
      motherName: "Anita Nair", motherPhone: "9000000302", parentEmail: "parent.nair@example.edu",
      marks: [76, 84, 79, 88, 82], attendance: 87, behavior: "Good", performance: "Good"
    },
    {
      id: "CC-1003", name: "Kabir Shah", usn: "CCS2024003", email: "kabir.shah@example.edu",
      phone: "9000000103", fatherName: "Nikhil Shah", fatherPhone: "9000000203",
      motherName: "Pooja Shah", motherPhone: "9000000303", parentEmail: "parent.shah@example.edu",
      marks: [62, 71, 68, 74, 65], attendance: 72, behavior: "Needs attention", performance: "At risk"
    }
  ];

  function parseStorage(key, fallback) {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    try {
      const value = JSON.parse(raw);
      if (!Array.isArray(value)) throw new Error("Stored data is not a list.");
      return value;
    } catch (error) {
      console.error("CampusCare could not read local data:", error);
      throw new Error("Saved portal data is unreadable. Clear this site's CampusCare storage to restart the demo.");
    }
  }

  function students() {
    return parseStorage(STORAGE.students, seedStudents);
  }

  function normalizeUsn(value) {
    return String(value || "").trim().toUpperCase();
  }

  function findStudentByUsn(usn) {
    const key = normalizeUsn(usn);
    return key ? students().find((item) => normalizeUsn(item.usn) === key) || null : null;
  }

  function saveStudents(value) {
    localStorage.setItem(STORAGE.students, JSON.stringify(value));
  }

  function studentAccounts() {
    return parseStorage(STORAGE.studentAccounts, []);
  }

  function hasStudentAccount(studentId) {
    return studentAccounts().some((account) => account.studentId === studentId);
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function passwordDigest(password, salt, iterations) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("Password setup requires a modern browser on localhost or HTTPS.");
    }
    const key = await window.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    return window.crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations || PASSWORD_ITERATIONS },
      key,
      256
    );
  }

  function equalBytes(left, right) {
    if (left.byteLength !== right.byteLength) return false;
    const leftBytes = new Uint8Array(left);
    const rightBytes = new Uint8Array(right);
    let difference = 0;
    for (let index = 0; index < leftBytes.length; index += 1) {
      difference |= leftBytes[index] ^ rightBytes[index];
    }
    return difference === 0;
  }

  async function activateStudentAccount(student, password) {
    if (!student || typeof student.id !== "string" || !student.id.trim()) {
      throw new Error("This student record has no stable ID. Ask the administrator to save the record before activation.");
    }
    const accounts = studentAccounts();
    if (accounts.some((account) => account.studentId === student.id)) {
      throw new Error("This student account is already activated. Contact the administrator if you need help.");
    }
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const digest = await passwordDigest(password, salt);
    accounts.push({
      studentId: student.id,
      usn: normalizeUsn(student.usn),
      salt: bytesToHex(salt),
      passwordHash: bytesToHex(digest),
      iterations: PASSWORD_ITERATIONS
    });
    saveStudentAccounts(accounts);
  }

  async function verifyStudentPassword(student, password) {
    const account = studentAccounts().find((entry) => entry.studentId === student.id);
    if (!account) return false;
    if (typeof account.salt !== "string" || !/^[0-9a-f]{32}$/i.test(account.salt) ||
        typeof account.passwordHash !== "string" || !/^[0-9a-f]{64}$/i.test(account.passwordHash) ||
        !Number.isInteger(account.iterations) || account.iterations < 10000 || account.iterations > 1000000) {
      throw new Error("The saved student login is unreadable. Contact the administrator.");
    }
    const salt = new Uint8Array(account.salt.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
    const expected = new Uint8Array(account.passwordHash.match(/.{2}/g).map((byte) => parseInt(byte, 16)));
    const digest = await passwordDigest(password, salt, account.iterations);
    return equalBytes(digest, expected.buffer);
  }

  function removeStudentAccount(studentId) {
    saveStudentAccounts(studentAccounts().filter((account) => account.studentId !== studentId));
  }

  function saveStudentAccounts(accounts) {
    localStorage.setItem(STORAGE.studentAccounts, JSON.stringify(accounts));
  }

  function retainStudentAccounts(records) {
    const studentIds = new Set(records.map((student) => student.id));
    saveStudentAccounts(studentAccounts().filter((account) => studentIds.has(account.studentId)));
  }

  function notifications() {
    return parseStorage(STORAGE.notifications, []);
  }

  function saveNotifications(value) {
    localStorage.setItem(STORAGE.notifications, JSON.stringify(value));
  }

  function setSession(value) {
    sessionStorage.setItem(STORAGE.session, JSON.stringify(value));
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE.session);
  }

  function session() {
    const raw = sessionStorage.getItem(STORAGE.session);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (!value || !["admin", "student", "parent"].includes(value.role) ||
          typeof value.account !== "string" || !value.account.trim()) {
        clearSession();
        return null;
      }
      return value;
    } catch (error) {
      console.error("CampusCare could not read the current session:", error);
      clearSession();
      return null;
    }
  }

  function logout() {
    clearSession();
    window.location.replace("index.html");
  }

  function requireRole(role) {
    const current = session();
    if (!current || current.role !== role) {
      window.location.replace("index.html");
      return null;
    }
    return current;
  }

  function id(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function showMessage(element, message, kind) {
    if (!element) return;
    element.textContent = message;
    element.className = "form-message" + (message ? " " + (kind || "info") : "");
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;
  }

  function attendanceClassification(value) {
    const percentage = Number(value);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return "Not available";
    if (percentage >= 85) return "Eligible";
    if (percentage >= 75) return "Borderline";
    return "Not Eligible";
  }

  function academicClassification(marks) {
    if (!Array.isArray(marks) || !marks.length) return "Not available";
    const percentage = average(marks);
    if (percentage >= 85) return "Good";
    if (percentage >= 60) return "Average";
    return "Poor";
  }

  window.CampusCare = {
    STORAGE,
    students,
    findStudentByUsn,
    saveStudents,
    hasStudentAccount,
    activateStudentAccount,
    verifyStudentPassword,
    removeStudentAccount,
    retainStudentAccounts,
    notifications,
    saveNotifications,
    setSession,
    clearSession,
    session,
    logout,
    requireRole,
    id,
    showMessage,
    average,
    attendanceClassification,
    academicClassification
  };
}());
