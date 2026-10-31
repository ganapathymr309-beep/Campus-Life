(function () {
  "use strict";

  const account = CampusCare.requireRole("student");
  if (!account) return;
  document.querySelector("[data-logout]").addEventListener("click", CampusCare.logout);

  const host = document.getElementById("student-content");
  const message = document.getElementById("student-message");

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render() {
    try {
      const student = CampusCare.students().find((item) => item.id === account.account);
      host.replaceChildren();
      if (!student) {
        CampusCare.showMessage(message, "Your activated student record is unavailable. Sign in again or contact an administrator.", "error");
        return;
      }
      document.getElementById("welcome").textContent = "Welcome, " + student.name;

      const summary = make("section", "summary-grid");
      const marks = Array.isArray(student.marks) ? student.marks : [];
      const avgMarks = CampusCare.average(marks);
      const attendanceStatus = CampusCare.attendanceClassification(student.attendance);
      const academicStatus = CampusCare.academicClassification(marks);
      [
        ["Attendance", student.attendance + "%", "Classification: " + attendanceStatus],
        ["Academic performance", marks.length ? avgMarks.toFixed(1) + "%" : "Not available", "Classification: " + academicStatus],
        ["Academic standing", student.performance || "Not set", "Administrator assessment"]
      ].forEach(([label, value, hint]) => {
        const card = make("article", "summary-card");
        card.append(make("span", "summary-label", label), make("strong", "summary-value", value), make("span", "summary-hint", hint));
        summary.append(card);
      });
      host.append(summary);

      const profile = make("section", "content-card");
      const profileHeadingRow = make("div", "section-heading");
      const profileHeading = make("div");
      profileHeading.append(make("p", "eyebrow eyebrow-blue", "MY PROFILE"), make("h2", "", student.name));
      profileHeadingRow.append(profileHeading, make("span", "status-chip", student.usn));
      profile.append(profileHeadingRow);
      const details = make("dl", "detail-grid");
      [
        ["Student ID", student.id], ["USN / register number", student.usn],
        ["Email", student.email], ["Phone", student.phone],
        ["Father", student.fatherName + " · " + student.fatherPhone],
        ["Mother", student.motherName + " · " + student.motherPhone]
      ].forEach(([label, value]) => {
        const item = make("div", "detail-item");
        item.append(make("dt", "", label), make("dd", "", value || "Not provided"));
        details.append(item);
      });
      profile.append(details);
      host.append(profile);

      const academics = make("section", "content-card");
      academics.append(make("div", "section-heading"));
      const head = academics.firstChild;
      const copy = make("div");
      copy.append(make("p", "eyebrow eyebrow-blue", "ACADEMIC RECORD"), make("h2", "", "Subject-wise marks"));
      head.append(copy, make("span", "muted", "Marks out of 100"));
      const tableWrap = make("div", "table-wrap");
      const table = make("table");
      table.innerHTML = "<thead><tr><th scope=\"col\">Subject</th><th scope=\"col\">Marks</th><th scope=\"col\">Progress</th></tr></thead>";
      const body = make("tbody");
      marks.forEach((mark, index) => {
        const row = make("tr");
        const subject = make("th", "", "Subject " + (index + 1));
        subject.scope = "row";
        const score = make("td", "score-cell", mark + " / 100");
        const progressCell = make("td");
        const progress = make("progress");
        progress.max = 100;
        progress.value = Number(mark);
        progress.setAttribute("aria-label", "Subject " + (index + 1) + " mark: " + mark + " out of 100");
        progressCell.append(progress);
        row.append(subject, score, progressCell);
        body.append(row);
      });
      table.append(body);
      tableWrap.append(table);
      academics.append(tableWrap);
      const notes = make("div", "insight-grid");
      notes.append(
        make("div", "insight-item", "Behavior: " + (student.behavior || "Not set")),
        make("div", "insight-item", "Academic performance assessment: " + (student.performance || "Not set"))
      );
      academics.append(notes);
      host.append(academics);
      CampusCare.showMessage(message, "", "");
    } catch (error) {
      CampusCare.showMessage(message, error.message, "error");
    }
  }

  render();
}());
