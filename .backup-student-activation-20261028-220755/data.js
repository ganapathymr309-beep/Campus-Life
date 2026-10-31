(function () {
  "use strict";

  const STORAGE = {
    students: "campuscare.students.v1",
    notifications: "campuscare.notifications.v1",
    session: "campuscare.session.v1"
  };

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

  function saveStudents(value) {
    localStorage.setItem(STORAGE.students, JSON.stringify(value));
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

  window.CampusCare = {
    STORAGE,
    students,
    saveStudents,
    notifications,
    saveNotifications,
    setSession,
    clearSession,
    session,
    logout,
    requireRole,
    id,
    showMessage,
    average
  };
}());
