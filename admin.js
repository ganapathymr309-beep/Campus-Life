(function () {
  "use strict";

  const account = CampusCare.requireRole("admin");
  if (!account) return;

  const form = document.getElementById("student-form");
  const notificationForm = document.getElementById("notification-form");
  const message = document.getElementById("admin-message");
  const importSummary = document.getElementById("import-summary");
  const rows = document.getElementById("student-rows");
  const notificationsHost = document.getElementById("notification-admin-list");
  const parentEmailRows = document.getElementById("parent-email-rows");
  const parentEmailHistory = document.getElementById("parent-email-history");
  const emailServiceStatus = document.getElementById("email-service-status");
  const emailPreviewDialog = document.getElementById("email-preview-dialog");
  const emailApiBase = window.location.port === "3000" ? window.location.origin : "http://127.0.0.1:3000";

  document.querySelector("[data-logout]").addEventListener("click", CampusCare.logout);
  window.addEventListener("storage", function (event) {
    if (event.key === CampusCare.STORAGE.studentAccounts) renderStudents();
  });
  document.getElementById("add-student-shortcut").addEventListener("click", function () {
    document.getElementById("student-editor").scrollIntoView({ behavior: "smooth" });
    form.elements.name.focus();
  });
  document.getElementById("cancel-edit").addEventListener("click", resetForm);
  document.getElementById("student-search").addEventListener("input", renderStudents);
  document.getElementById("import-workbook").addEventListener("click", importWorkbook);
  document.getElementById("export-workbook").addEventListener("click", exportWorkbook);
  document.getElementById("failed-notifications-only").addEventListener("change", function () {
    renderParentEmailHistory().catch((error) =>
      CampusCare.showMessage(message, "Could not load parent email history: " + error.message, "error")
    );
  });
  document.getElementById("close-email-preview").addEventListener("click", () => emailPreviewDialog.close());
  form.addEventListener("submit", saveStudent);
  notificationForm.addEventListener("submit", sendNotification);
  const notificationServiceReady = initializeNotificationService();

  async function emailApi(route, body) {
    const response = await fetch(emailApiBase + route, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("The notification backend returned an unreadable response.");
    }
    if (!response.ok) throw new Error(result.error || "The notification request failed.");
    return result;
  }

  async function initializeNotificationService() {
    try {
      const health = await emailApi("/api/health");
      await emailApi("/api/notifications/sync", { students: CampusCare.students() });
      if (health.emailMode === "console") {
        emailServiceStatus.textContent = health.message;
        emailServiceStatus.className = "service-status warning";
      } else if (!health.providerConfigured) {
        emailServiceStatus.textContent = health.message + " Missing: " + health.missingEmailFields.join(", ");
        emailServiceStatus.className = "service-status error";
      } else {
        emailServiceStatus.textContent = health.message;
        emailServiceStatus.className = "service-status success";
      }
      await renderParentEmailNotifications();
      return health;
    } catch (error) {
      emailServiceStatus.textContent = "Notification backend unavailable. Start CampusCare with npm start to enable previews, history, and email delivery.";
      emailServiceStatus.className = "service-status error";
      parentEmailRows.replaceChildren();
      document.getElementById("parent-email-empty").hidden = false;
      parentEmailHistory.replaceChildren(make("p", "empty-state", error.message));
      return null;
    }
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function recordFromForm() {
    const data = new FormData(form);
    const marks = [1, 2, 3, 4, 5].map((number) => Number(data.get("mark" + number)));
    const student = {
      id: String(data.get("id") || CampusCare.id("CC")),
      name: String(data.get("name")).trim(),
      usn: String(data.get("usn")).trim(),
      email: String(data.get("email")).trim(),
      phone: String(data.get("phone")).trim(),
      fatherName: String(data.get("fatherName")).trim(),
      fatherPhone: String(data.get("fatherPhone")).trim(),
      motherName: String(data.get("motherName")).trim(),
      motherPhone: String(data.get("motherPhone")).trim(),
      parentEmail: String(data.get("parentEmail")).trim(),
      marks: marks,
      attendance: Number(data.get("attendance")),
      behavior: String(data.get("behavior")).trim(),
      performance: String(data.get("performance")).trim()
    };
    return student;
  }

  function validateStudent(student, existing, editingId) {
    if (!student.name || !student.usn || !student.email || !student.parentEmail) return "Name, USN, student email, and parent email are required.";
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(student.email) || !emailPattern.test(student.parentEmail)) return "Enter valid student and parent email addresses.";
    if (student.marks.some((mark) => !Number.isFinite(mark) || mark < 0 || mark > 100)) return "Each subject mark must be between 0 and 100.";
    if (!Number.isFinite(student.attendance) || student.attendance < 0 || student.attendance > 100) return "Attendance must be between 0 and 100.";
    if (!student.behavior || !student.performance) return "Behavior and academic performance are required.";
    if (existing.some((item) => item.usn.toLowerCase() === student.usn.toLowerCase() && item.id !== editingId)) return "A student with this USN already exists.";
    return "";
  }

  async function saveStudent(event) {
    event.preventDefault();
    const students = CampusCare.students();
    const student = recordFromForm();
    const error = validateStudent(student, students, student.id);
    if (error) {
      CampusCare.showMessage(message, error, "error");
      return;
    }
    try {
      const index = students.findIndex((item) => item.id === student.id);
      if (index >= 0) students[index] = student;
      else students.push(student);
      CampusCare.saveStudents(students);
      resetForm();
      refresh();
      try {
        if (!await notificationServiceReady) throw new Error("The notification backend is unavailable.");
        const result = await emailApi("/api/notifications/evaluate", { student: student });
        const failures = result.notifications.filter((item) => item.status === "failed");
        const sent = result.notifications.filter((item) => item.status === "sent");
        const test = result.notifications.filter((item) => item.status === "test");
        let statusMessage = index >= 0 ? "Student record updated." : "Student added.";
        if (failures.length) {
          statusMessage += " " + failures.length + " parent email(s) failed: " +
            failures.map((item) => item.deliveryResult).join(" ");
          CampusCare.showMessage(message, statusMessage, "error");
        } else {
          if (sent.length) statusMessage += " " + sent.length + " parent email(s) accepted by the provider.";
          else if (test.length) statusMessage += " Test mode: " + test.length + " email(s) were recorded but not delivered.";
          else if (!result.notifications.length && index >= 0) statusMessage += " No classification changed, so no duplicate email was sent.";
          CampusCare.showMessage(message, statusMessage, "success");
        }
      } catch (emailError) {
        CampusCare.showMessage(message, "Student record saved, but parent email evaluation failed: " + emailError.message, "error");
      }
      try {
        await renderParentEmailNotifications();
      } catch (historyError) {
        CampusCare.showMessage(message, "Student record saved, but notification history could not be refreshed: " + historyError.message, "error");
      }
    } catch (error) {
      CampusCare.showMessage(message, "Could not save the student: " + error.message, "error");
    }
  }

  function resetForm() {
    form.reset();
    form.elements.id.value = "";
    document.getElementById("form-title").textContent = "Add a student";
    document.getElementById("save-student").textContent = "Add student";
    document.getElementById("cancel-edit").hidden = true;
  }

  function editStudent(student) {
    form.elements.id.value = student.id;
    ["name", "usn", "email", "phone", "fatherName", "fatherPhone", "motherName", "motherPhone", "parentEmail", "attendance", "behavior", "performance"].forEach((name) => {
      form.elements[name].value = student[name] === undefined ? "" : student[name];
    });
    student.marks.forEach((mark, index) => { form.elements["mark" + (index + 1)].value = mark; });
    document.getElementById("form-title").textContent = "Edit student";
    document.getElementById("save-student").textContent = "Save changes";
    document.getElementById("cancel-edit").hidden = false;
    document.getElementById("student-editor").scrollIntoView({ behavior: "smooth" });
    form.elements.name.focus();
  }

  function renderStats(students, notifications) {
    const stats = document.getElementById("dashboard-stats");
    stats.replaceChildren();
    [
      ["Total students", String(students.length), "Active student records"],
      ["Average attendance", students.length ? CampusCare.average(students.map((item) => item.attendance)).toFixed(1) + "%" : "—", "Across current roster"],
      ["Notifications sent", String(notifications.length), "Saved in this browser"],
      ["System status", "Demo mode", "Data stored locally"]
    ].forEach(([label, value, hint]) => {
      const card = make("article", "summary-card");
      card.append(make("span", "summary-label", label), make("strong", "summary-value", value), make("span", "summary-hint", hint));
      stats.append(card);
    });
  }

  function renderStudents() {
    try {
      const students = CampusCare.students();
      const term = document.getElementById("student-search").value.trim().toLowerCase();
      const visible = students.filter((item) => (item.name + " " + item.usn).toLowerCase().includes(term));
      rows.replaceChildren();
      document.getElementById("students-empty").hidden = visible.length > 0;
      visible.forEach((student) => {
        const row = make("tr");
        const studentCell = make("td");
        studentCell.append(make("strong", "table-primary", student.name), make("span", "table-secondary", student.email));
        const attendanceCell = make("td");
        attendanceCell.append(
          make("strong", "table-primary", Number(student.attendance).toFixed(1) + "%"),
          make("span", "table-secondary", CampusCare.attendanceClassification(student.attendance))
        );
        const academicCell = make("td");
        const marks = Array.isArray(student.marks) ? student.marks : [];
        academicCell.append(
          make("strong", "table-primary", marks.length ? CampusCare.average(marks).toFixed(1) + "%" : "Not available"),
          make("span", "table-secondary", CampusCare.academicClassification(marks))
        );
        row.append(
          studentCell,
          make("td", "mono", student.usn),
          attendanceCell,
          academicCell,
          make("td", "table-secondary", CampusCare.hasStudentAccount(student.id) ? "Activated" : "Setup needed"),
          make("td", "table-secondary", student.parentEmail || "Not linked")
        );
        const actionCell = make("td", "action-cell");
        const edit = make("button", "button button-small button-outline", "Edit");
        edit.type = "button";
        edit.addEventListener("click", () => editStudent(student));
        const remove = make("button", "button button-small button-danger", "Delete");
        remove.type = "button";
        remove.addEventListener("click", () => deleteStudent(student));
        actionCell.append(edit, remove);
        row.append(actionCell);
        rows.append(row);
      });
    } catch (error) {
      CampusCare.showMessage(message, error.message, "error");
    }
  }

  async function renderParentEmailNotifications() {
    const students = CampusCare.students();
    const result = await emailApi("/api/notifications");
    const latestByUsn = new Map();
    result.notifications.forEach((item) => {
      const key = item.usn.toLowerCase();
      if (!latestByUsn.has(key)) latestByUsn.set(key, item);
    });
    parentEmailRows.replaceChildren();
    document.getElementById("parent-email-empty").hidden = students.length > 0;
    students.forEach((student) => {
      const row = make("tr");
      const latest = latestByUsn.get(student.usn.toLowerCase());
      const marks = Array.isArray(student.marks) ? student.marks : [];
      const academicPercentage = marks.length ? CampusCare.average(marks).toFixed(1) + "%" : "Not available";
      const lastDate = latest ? new Date(latest.date).toLocaleString() : "Never";
      const deliveryCell = make("td");
      deliveryCell.append(
        make("strong", "table-primary", latest ? latest.status : "Not sent"),
        make("span", "table-secondary", latest ? latest.deliveryResult : "No notification")
      );
      row.append(
        make("td", "", student.name),
        make("td", "mono", student.usn),
        make("td", "", Number(student.attendance).toFixed(1) + "%"),
        make("td", "", CampusCare.attendanceClassification(student.attendance)),
        make("td", "", academicPercentage),
        make("td", "", CampusCare.academicClassification(marks)),
        make("td", "", student.parentEmail || "Not linked"),
        make("td", "", lastDate),
        deliveryCell
      );
      const actions = make("td", "action-cell");
      const preview = make("button", "button button-small button-outline", "Preview");
      preview.type = "button";
      preview.addEventListener("click", () => previewParentEmail(student));
      const send = make("button", "button button-small button-primary", "Send update");
      send.type = "button";
      send.addEventListener("click", () => sendManualParentEmail(student, send));
      actions.append(preview, send);
      row.append(actions);
      parentEmailRows.append(row);
    });
    await renderParentEmailHistory();
  }

  async function renderParentEmailHistory() {
    const failedOnly = document.getElementById("failed-notifications-only").checked;
    const result = await emailApi("/api/notifications" + (failedOnly ? "?failedOnly=true" : ""));
    parentEmailHistory.replaceChildren();
    if (!result.notifications.length) {
      parentEmailHistory.append(make("p", "empty-state", failedOnly ? "There are no failed email notifications." : "No parent email notifications have been recorded."));
      return;
    }
    result.notifications.forEach((item) => {
      const card = make("article", "notification-item");
      const top = make("div", "notification-top");
      top.append(
        make("span", "category-tag", item.category),
        make("time", "muted", new Date(item.date).toLocaleString())
      );
      card.append(
        top,
        make("h3", "", item.studentName + " · " + item.usn),
        make("p", "muted", "Parent email: " + item.parentEmail),
        make("p", "", "Delivery: " + item.status),
        make("p", "", item.deliveryResult || "No delivery result recorded.")
      );
      const details = document.createElement("details");
      const summary = make("summary", "", "View email content");
      const body = make("pre", "email-history-body", item.body);
      details.append(summary, body);
      card.append(details);
      if (item.status === "failed") {
        const retry = make("button", "button button-small button-outline", "Retry failed notification");
        retry.type = "button";
        retry.addEventListener("click", () => retryParentEmail(item, retry));
        card.append(retry);
      }
      parentEmailHistory.append(card);
    });
  }

  async function previewParentEmail(student) {
    try {
      if (!await notificationServiceReady) throw new Error("The notification backend is unavailable.");
      const preview = await emailApi("/api/notifications/preview", { student: student });
      document.getElementById("email-preview-recipient").textContent = preview.to;
      document.getElementById("email-preview-subject").textContent = preview.subject;
      document.getElementById("email-preview-body").textContent = preview.text;
      emailPreviewDialog.showModal();
    } catch (error) {
      CampusCare.showMessage(message, "Could not preview the parent email: " + error.message, "error");
    }
  }

  async function sendManualParentEmail(student, button) {
    button.disabled = true;
    try {
      if (!await notificationServiceReady) throw new Error("The notification backend is unavailable.");
      const result = await emailApi("/api/notifications/manual", { student: student });
      const item = result.notification;
      if (item.status === "failed") {
        CampusCare.showMessage(message, "Parent email failed for " + student.usn + ": " + item.deliveryResult, "error");
      } else if (item.status === "test") {
        CampusCare.showMessage(message, "Test mode: the update for " + student.usn + " was recorded but not delivered.", "info");
      } else {
        CampusCare.showMessage(message, "Email update accepted by the provider for " + student.usn + ".", "success");
      }
      try {
        await renderParentEmailNotifications();
      } catch (historyError) {
        CampusCare.showMessage(message, "Email was processed, but notification history could not be refreshed: " + historyError.message, "error");
      }
    } catch (error) {
      CampusCare.showMessage(message, "Could not send parent update: " + error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function retryParentEmail(item, button) {
    button.disabled = true;
    try {
      const result = await emailApi("/api/notifications/" + encodeURIComponent(item.id) + "/retry", {});
      const retried = result.notification;
      CampusCare.showMessage(
        message,
        retried.status === "sent"
          ? "Retry accepted by the provider for " + retried.usn + "."
          : retried.status === "test"
            ? "Test mode: retry recorded but no email was delivered."
            : "Retry failed for " + retried.usn + ": " + retried.deliveryResult,
        retried.status === "failed" ? "error" : "info"
      );
      try {
        await renderParentEmailNotifications();
      } catch (historyError) {
        CampusCare.showMessage(message, "Email retry completed, but notification history could not be refreshed: " + historyError.message, "error");
      }
    } catch (error) {
      CampusCare.showMessage(message, "Could not retry the parent email: " + error.message, "error");
      button.disabled = false;
    }
  }

  function deleteStudent(student) {
    const linked = CampusCare.notifications().filter((item) => item.usn === student.usn).length;
    const impact = linked ? " " + linked + " linked notification(s) will also be deleted." : "";
    if (!window.confirm("Delete " + student.name + " (" + student.usn + ")? This cannot be undone." + impact)) return;
    try {
      CampusCare.saveStudents(CampusCare.students().filter((item) => item.id !== student.id));
      CampusCare.removeStudentAccount(student.id);
      CampusCare.saveNotifications(CampusCare.notifications().filter((item) => item.usn !== student.usn));
      resetForm();
      refresh();
      CampusCare.showMessage(message, "Student and associated notifications deleted.", "success");
    } catch (error) {
      CampusCare.showMessage(message, "Could not delete the student: " + error.message, "error");
    }
  }

  function refreshNotificationStudents() {
    const select = document.getElementById("notification-student");
    const selected = select.value;
    select.replaceChildren(new Option("Select a student", ""));
    CampusCare.students().forEach((student) => {
      const option = new Option(student.name + " · " + student.usn + " · " + (student.parentEmail || "no parent email"), student.usn);
      select.add(option);
    });
    if (CampusCare.students().some((student) => student.usn === selected)) select.value = selected;
  }

  function renderNotifications() {
    const all = CampusCare.notifications().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    notificationsHost.replaceChildren();
    if (!all.length) {
      notificationsHost.append(make("p", "empty-state", "No notifications have been sent yet."));
      return;
    }
    const students = CampusCare.students();
    all.forEach((item) => {
      const student = students.find((entry) => entry.usn === item.usn);
      const card = make("article", "notification-item");
      const top = make("div", "notification-top");
      top.append(make("span", "category-tag", item.category), make("time", "muted", new Date(item.date).toLocaleString()));
      card.append(top, make("h3", "", item.title), make("p", "muted", (student ? student.name : "Former student") + " · " + item.usn), make("p", "", item.message), make("span", "read-label", item.read ? "Read by parent" : "Unread"));
      const remove = make("button", "button button-small button-danger", "Delete notification");
      remove.type = "button";
      remove.addEventListener("click", function () {
        if (!window.confirm("Delete this notification?")) return;
        CampusCare.saveNotifications(CampusCare.notifications().filter((entry) => entry.id !== item.id));
        renderNotifications();
        renderStats(CampusCare.students(), CampusCare.notifications());
      });
      card.append(remove);
      notificationsHost.append(card);
    });
  }

  function sendNotification(event) {
    event.preventDefault();
    const values = new FormData(notificationForm);
    const usn = String(values.get("usn") || "");
    const student = CampusCare.students().find((item) => item.usn === usn);
    const title = String(values.get("title") || "").trim();
    const text = String(values.get("message") || "").trim();
    const category = String(values.get("category") || "");
    if (!student || !category || !title || !text) {
      CampusCare.showMessage(message, "Select a student and complete the category, title, and message.", "error");
      return;
    }
    if (!student.parentEmail) {
      CampusCare.showMessage(message, "Add a parent account email to this student record before sending a notification.", "error");
      return;
    }
    try {
      const all = CampusCare.notifications();
      all.push({ id: CampusCare.id("NTF"), usn: student.usn, studentName: student.name, category: category, title: title, message: text, date: new Date().toISOString(), read: false });
      CampusCare.saveNotifications(all);
      notificationForm.reset();
      renderNotifications();
      renderStats(CampusCare.students(), all);
      CampusCare.showMessage(message, "Notification sent to the parent account linked to " + student.name + ".", "success");
    } catch (error) {
      CampusCare.showMessage(message, "Could not save the notification: " + error.message, "error");
    }
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function rowValue(row, aliases) {
    const entries = Object.entries(row);
    for (const alias of aliases) {
      const wanted = normalize(alias);
      const match = entries.find(([key]) => normalize(key) === wanted);
      // sheet_to_json uses raw:false so formatted Excel numbers arrive as strings.
      if (match && String(match[1]).trim() !== "") return String(match[1]).trim();
    }
    return "";
  }

  const studentFieldAliases = {
    phone: ["Phone", "Phone Number", "Phone No", "Student Phone", "Student's Phone", "Student Phone Number", "Student's Phone Number", "Student Phone No", "Student Number Phone", "Student Mobile", "Student's Mobile", "Student Mobile Number", "Student's Mobile Number", "Mobile", "Mobile No", "Mobile Number", "Contact Number", "Student Contact", "Student Contact Number"],
    fatherPhone: ["Father Phone", "Father's Phone", "Father Phone Number", "Father's Phone Number", "Father Mobile", "Father's Mobile", "Father Mobile No", "Father Mobile Number", "Father's Mobile Number", "Father Contact Number", "Father's Contact Number"],
    motherPhone: ["Mother Phone", "Mother's Phone", "Mother Phone Number", "Mother's Phone Number", "Mother Mobile", "Mother's Mobile", "Mother Mobile No", "Mother Mobile Number", "Mother's Mobile Number", "Mother Contact Number", "Mother's Contact Number"],
    parentEmail: ["Parent Email", "Parent's Email", "Parent Account Email", "Parent Email Address", "Parent Email ID", "Father Email", "Mother Email", "Guardian Email", "Guardian Email Address"]
  };

  function worksheetHeaders(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    return (rows[0] || []).map((header) => String(header).trim()).filter(Boolean);
  }

  function matchedHeaders(headers, aliases) {
    const wanted = new Set(aliases.map(normalize));
    return headers.filter((header) => wanted.has(normalize(header)));
  }

  function sheetRows(workbook, name) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error('Required worksheet "' + name + '" is missing.');
    const headers = worksheetHeaders(sheet).map(normalize);
    const required = {
      Students: [
        ["USN", "Register Number", "Student Number", "Student No"],
        ["Student Name", "Name"]
      ],
      Academic: [["USN", "Register Number", "Student Number", "Student No"]],
      Notifications: [
        ["USN", "Register Number", "Student Number", "Student No"],
        ["Title", "Notification Title"],
        ["Message", "Notification Message"]
      ]
    }[name];
    const missing = required.filter((aliases) => !aliases.some((alias) => headers.includes(normalize(alias))));
    if (missing.length) {
      const labels = missing.map((aliases) => aliases[0]).join(", ");
      throw new Error('Worksheet "' + name + '" is missing required column(s): ' + labels + ".");
    }
    return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }

  function emailValid(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function importWorkbook() {
    importSummary.textContent = "";
    const file = document.getElementById("workbook-file").files[0];
    if (!file) {
      importSummary.textContent = "Choose an Excel workbook first.";
      importSummary.className = "import-summary error";
      return;
    }
    if (!window.XLSX) {
      importSummary.textContent = "The Excel library could not be loaded. Check your internet connection and reload the page.";
      importSummary.className = "import-summary error";
      return;
    }
    const reader = new FileReader();
    reader.onerror = function () {
      importSummary.textContent = "The selected workbook could not be read.";
      importSummary.className = "import-summary error";
    };
    reader.onload = async function (event) {
      try {
        const workbook = XLSX.read(event.target.result, { type: "array" });
        const studentRows = sheetRows(workbook, "Students");
        const academicRows = sheetRows(workbook, "Academic");
        const notificationRows = sheetRows(workbook, "Notifications");
        const studentHeaders = worksheetHeaders(workbook.Sheets.Students);
        const phoneMappings = Object.entries(studentFieldAliases).map(([field, aliases]) => ({
          field: field,
          aliases: aliases,
          headers: matchedHeaders(studentHeaders, aliases),
          populated: 0,
          missing: 0
        }));
        const mode = document.getElementById("import-mode").value;
        if (mode === "replace" && !window.confirm("Replace the current student roster with the valid student rows in this workbook? Existing notifications will be preserved and workbook notifications will be added when new.")) return;
        const current = CampusCare.students();
        const base = mode === "merge" ? current.slice() : [];
        const importedByUsn = new Map(base.map((item, index) => [item.usn.toLowerCase(), index]));
        const errors = [];
        let importedCount = 0;

        studentRows.forEach((row, index) => {
          const line = index + 2;
          const rowErrorStart = errors.length;
          const usn = rowValue(row, ["USN", "Register Number", "Student Number", "Student No"]);
          const name = rowValue(row, ["Student Name", "Name"]);
          if (!usn || !name) {
            if (Object.values(row).some((value) => String(value).trim())) errors.push("Students row " + line + ": USN and student name are required.");
            return;
          }
          const key = usn.toLowerCase();
          const foundIndex = importedByUsn.get(key);
          if (foundIndex !== undefined && mode === "replace") {
            errors.push("Students row " + line + ": duplicate USN " + usn + ".");
            return;
          }
          if (foundIndex !== undefined && mode === "merge" && studentRows.slice(0, index).some((prior) => rowValue(prior, ["USN", "Register Number", "Student Number", "Student No"]).toLowerCase() === key)) {
            errors.push("Students row " + line + ": duplicate USN " + usn + " in workbook.");
            return;
          }
          const existing = foundIndex === undefined ? null : base[foundIndex];
          const replacedStudent = mode === "replace"
            ? current.find((item) => item.usn.toLowerCase() === key)
            : null;
          const student = existing ? Object.assign({}, existing, { marks: existing.marks.slice() }) : {
            id: rowValue(row, ["Student ID", "ID"]) || (replacedStudent && replacedStudent.id) || CampusCare.id("CC"),
            name: "", usn: usn, email: "", phone: "", fatherName: "", fatherPhone: "",
            motherName: "", motherPhone: "", parentEmail: "", marks: [0, 0, 0, 0, 0],
            attendance: 0, behavior: "", performance: ""
          };
          student.usn = usn;
          student.name = name;
          const fields = [
            ["email", ["Email", "Student Email", "Student gmail", "Student Gmail"]],
            ["phone", studentFieldAliases.phone],
            ["fatherName", ["Father Name", "Father's Name"]],
            ["fatherPhone", studentFieldAliases.fatherPhone],
            ["motherName", ["Mother Name", "Mother's Name"]],
            ["motherPhone", studentFieldAliases.motherPhone],
            ["parentEmail", studentFieldAliases.parentEmail],
            ["behavior", ["Behavior", "Behaviour"]],
            ["performance", ["Academic Performance", "Performance"]]
          ];
          fields.forEach(([field, aliases]) => {
            const value = rowValue(row, aliases);
            if (value) {
              student[field] = value;
              const mapping = phoneMappings.find((entry) => entry.field === field);
              if (mapping) mapping.populated += 1;
            } else {
              const mapping = phoneMappings.find((entry) => entry.field === field);
              if (mapping) mapping.missing += 1;
            }
          });
          const attendance = rowValue(row, ["Attendance", "Attendance Percentage", "Attendence"]);
          if (attendance !== "") {
            const number = Number(attendance.replace("%", ""));
            if (Number.isFinite(number) && number >= 0 && number <= 100) student.attendance = number;
            else errors.push("Students row " + line + ": attendance must be between 0 and 100.");
          }
          const email = student.email;
          if (email && !emailValid(email)) errors.push("Students row " + line + ": invalid student email.");
          if (student.parentEmail && !emailValid(student.parentEmail)) errors.push("Students row " + line + ": invalid parent email.");
          if (errors.length > rowErrorStart) return;
          if (foundIndex === undefined) {
            importedByUsn.set(key, base.length);
            base.push(student);
          } else {
            base[foundIndex] = student;
          }
          importedCount += 1;
        });

        let academicCount = 0;
        academicRows.forEach((row, index) => {
          const line = index + 2;
          const rowErrorStart = errors.length;
          const usn = rowValue(row, ["USN", "Register Number", "Student Number", "Student No"]);
          if (!usn) {
            if (Object.values(row).some((value) => String(value).trim())) errors.push("Academic row " + line + ": USN is required.");
            return;
          }
          const studentIndex = base.findIndex((item) => item.usn.toLowerCase() === usn.toLowerCase());
          if (studentIndex < 0) {
            errors.push("Academic row " + line + ": no imported/current student matches USN " + usn + ".");
            return;
          }
          const student = Object.assign({}, base[studentIndex], { marks: base[studentIndex].marks.slice() });
          for (let subject = 1; subject <= 5; subject += 1) {
            const rawMark = rowValue(row, ["Subject " + subject, "Subject " + subject + " Marks", "Subject" + subject, "Marks " + subject, "Sub " + subject]);
            if (rawMark === "") continue;
            const mark = Number(rawMark);
            if (!Number.isFinite(mark) || mark < 0 || mark > 100) errors.push("Academic row " + line + ": subject " + subject + " mark must be between 0 and 100.");
            else student.marks[subject - 1] = mark;
          }
          const attendance = rowValue(row, ["Attendance", "Attendance Percentage", "Attendence"]);
          if (attendance !== "") {
            const value = Number(attendance.replace("%", ""));
            if (Number.isFinite(value) && value >= 0 && value <= 100) student.attendance = value;
            else errors.push("Academic row " + line + ": attendance must be between 0 and 100.");
          }
          const behavior = rowValue(row, ["Behavior", "Behaviour"]);
          const performance = rowValue(row, ["Academic Performance", "Performance"]);
          if (behavior) student.behavior = behavior;
          if (performance) student.performance = performance;
          if (errors.length > rowErrorStart) return;
          base[studentIndex] = student;
          academicCount += 1;
        });

        const existingNotifications = CampusCare.notifications();
        const notificationIds = new Set(existingNotifications.map((item) => item.id));
        let notificationCount = 0;
        const combinedNotifications = existingNotifications.slice();
        notificationRows.forEach((row, index) => {
          const line = index + 2;
          const usn = rowValue(row, ["USN", "Register Number", "Student Number", "Student No"]);
          const title = rowValue(row, ["Title", "Notification Title"]);
          const text = rowValue(row, ["Message", "Notification Message"]);
          if (!usn && !title && !text) return;
          if (!usn || !title || !text) {
            errors.push("Notifications row " + line + ": USN, title, and message are required.");
            return;
          }
          const id = rowValue(row, ["Notification ID", "ID"]) || CampusCare.id("NTF");
          if (notificationIds.has(id)) return;
          const linked = base.find((item) => item.usn.toLowerCase() === usn.toLowerCase());
          const dateText = rowValue(row, ["Date", "Date and Time", "Timestamp"]);
          const parsedDate = dateText ? new Date(dateText) : new Date();
          combinedNotifications.push({
            id: id, usn: usn, studentName: linked ? linked.name : rowValue(row, ["Student Name"]),
            category: rowValue(row, ["Category"]) || "General", title: title, message: text,
            date: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
            read: rowValue(row, ["Read", "Read Status"]).toLowerCase() === "true"
          });
          notificationIds.add(id);
          notificationCount += 1;
        });

        CampusCare.saveStudents(base);
        CampusCare.retainStudentAccounts(base);
        CampusCare.saveNotifications(combinedNotifications);
        const emailDeliveryDiagnostics = [];
        const service = await notificationServiceReady;
        if (!service) {
          emailDeliveryDiagnostics.push("Automatic parent email evaluation was not performed because the notification backend is unavailable.");
        } else {
          for (const student of base) {
            try {
              const evaluation = await emailApi("/api/notifications/evaluate", { student: student });
              evaluation.notifications.filter((item) => item.status === "failed").forEach((item) => {
                emailDeliveryDiagnostics.push(item.usn + " " + item.category + " email failed: " + item.deliveryResult);
              });
            } catch (emailError) {
              emailDeliveryDiagnostics.push(student.usn + " email evaluation failed: " + emailError.message);
            }
          }
        }
        refresh();
        try {
          await renderParentEmailNotifications();
        } catch (historyError) {
          emailDeliveryDiagnostics.push("Email history could not be refreshed: " + historyError.message);
        }
        importSummary.className = "import-summary" + (errors.length ? " warning" : " success");
        const mappingDiagnostics = phoneMappings.map((mapping) => {
          const label = {
            phone: "student phone",
            fatherPhone: "father phone",
            motherPhone: "mother phone",
            parentEmail: "parent account email"
          }[mapping.field];
          if (!mapping.headers.length) {
            return "No recognized " + label + " column (checked " + mapping.aliases.join(", ") +
              "). Available Students headers: " + (studentHeaders.join(", ") || "(none)") + ".";
          }
          const diagnostic = label + " mapped from \"" + mapping.headers.join(", ") + "\" (" +
            mapping.populated + " row(s) populated";
          return diagnostic + (mapping.missing ? ", " + mapping.missing + " row(s) blank; existing values were preserved" : "") + ").";
        });
        importSummary.textContent = "Imported " + importedCount + " student row(s), updated " + academicCount + " academic row(s), and added " + notificationCount + " notification(s). " +
          (mode === "merge" ? "Existing students were retained." : "Student roster was replaced; all prior notifications were retained.") +
          " " + mappingDiagnostics.join(" ") +
          (errors.length ? " Validation issues (" + errors.length + "): " + errors.join(" ") : " No validation issues.") +
          (emailDeliveryDiagnostics.length ? " Email delivery: " + emailDeliveryDiagnostics.join(" ") : "");
        if (phoneMappings.some((mapping) => !mapping.headers.length || mapping.missing)) {
          importSummary.className = "import-summary warning";
        }
        if (emailDeliveryDiagnostics.length) importSummary.className = "import-summary warning";
      } catch (error) {
        importSummary.className = "import-summary error";
        importSummary.textContent = "Import failed: " + error.message;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function exportWorkbook() {
    if (!window.XLSX) {
      importSummary.className = "import-summary error";
      importSummary.textContent = "The Excel library could not be loaded. Check your internet connection and reload the page.";
      return;
    }
    try {
      const students = CampusCare.students();
      const notifications = CampusCare.notifications();
      const studentSheet = students.map((student) => ({
        "Student ID": student.id, "Student Name": student.name, "USN": student.usn,
        "Student Email": student.email, "Student Phone": student.phone,
        "Father Name": student.fatherName, "Father Phone": student.fatherPhone,
        "Mother Name": student.motherName, "Mother Phone": student.motherPhone,
        "Parent Email": student.parentEmail
      }));
      const academicSheet = students.map((student) => {
        const row = { USN: student.usn, "Student Name": student.name };
        student.marks.forEach((mark, index) => { row["Subject " + (index + 1)] = mark; });
        row.Attendance = student.attendance;
        row.Behavior = student.behavior;
        row["Academic Performance"] = student.performance;
        return row;
      });
      const notificationSheet = notifications.map((item) => ({
        "Notification ID": item.id, USN: item.usn, "Student Name": item.studentName,
        Category: item.category, Title: item.title, Message: item.message,
        Date: item.date, Read: Boolean(item.read)
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(studentSheet, {
        header: ["Student ID", "Student Name", "USN", "Student Email", "Student Phone", "Father Name", "Father Phone", "Mother Name", "Mother Phone", "Parent Email"]
      }), "Students");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(academicSheet, {
        header: ["USN", "Student Name", "Subject 1", "Subject 2", "Subject 3", "Subject 4", "Subject 5", "Attendance", "Behavior", "Academic Performance"]
      }), "Academic");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notificationSheet, {
        header: ["Notification ID", "USN", "Student Name", "Category", "Title", "Message", "Date", "Read"]
      }), "Notifications");
      XLSX.writeFile(workbook, "CampusCare-data.xlsx");
      importSummary.className = "import-summary success";
      importSummary.textContent = "Excel workbook exported with Students, Academic, and Notifications worksheets.";
    } catch (error) {
      importSummary.className = "import-summary error";
      importSummary.textContent = "Export failed: " + error.message;
    }
  }

  function refresh() {
    try {
      const students = CampusCare.students();
      const notifications = CampusCare.notifications();
      renderStats(students, notifications);
      renderStudents();
      refreshNotificationStudents();
      renderNotifications();
    } catch (error) {
      CampusCare.showMessage(message, error.message, "error");
    }
  }

  refresh();
}());
