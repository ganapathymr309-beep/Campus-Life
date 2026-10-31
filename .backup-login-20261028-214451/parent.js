(function () {
  "use strict";

  const account = CampusCare.requireRole("parent");
  if (!account) return;
  document.querySelector("[data-logout]").addEventListener("click", CampusCare.logout);
  const host = document.getElementById("parent-content");
  const message = document.getElementById("parent-message");
  const unreadBadge = document.getElementById("unread-badge");

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render() {
    try {
      const student = CampusCare.students().find((item) => item.parentEmail.toLowerCase() === account.account.toLowerCase());
      host.replaceChildren();
      if (!student) {
        CampusCare.showMessage(message, "No student is currently linked to this parent account.", "error");
        return;
      }
      const allNotifications = CampusCare.notifications();
      const linkedNotifications = allNotifications.filter((item) => item.usn === student.usn);
      const unreadCount = linkedNotifications.filter((item) => !item.read).length;
      unreadBadge.textContent = unreadCount + " unread notification" + (unreadCount === 1 ? "" : "s");
      document.getElementById("welcome").textContent = student.name + "'s progress";

      const stats = make("section", "summary-grid");
      [
        ["Attendance", student.attendance + "%", "Current attendance"],
        ["Average marks", CampusCare.average(student.marks).toFixed(1) + "%", "Across five subjects"],
        ["Notifications", String(linkedNotifications.length), unreadCount + " unread"]
      ].forEach(([label, value, hint]) => {
        const card = make("article", "summary-card");
        card.append(make("span", "summary-label", label), make("strong", "summary-value", value), make("span", "summary-hint", hint));
        stats.append(card);
      });
      host.append(stats);

      const studentCard = make("section", "content-card");
      const heading = make("div", "section-heading");
      const title = make("div");
      title.append(make("p", "eyebrow eyebrow-blue", "STUDENT PROFILE"), make("h2", "", student.name));
      heading.append(title, make("span", "status-chip", student.usn));
      studentCard.append(heading);
      const details = make("dl", "detail-grid");
      [
        ["Student ID", student.id], ["Student email", student.email],
        ["Student phone", student.phone], ["Father", student.fatherName + " · " + student.fatherPhone],
        ["Mother", student.motherName + " · " + student.motherPhone]
      ].forEach(([label, value]) => {
        const item = make("div", "detail-item");
        item.append(make("dt", "", label), make("dd", "", value || "Not provided"));
        details.append(item);
      });
      studentCard.append(details);
      host.append(studentCard);

      const academicCard = make("section", "content-card");
      const academicHeading = make("div", "section-heading");
      const academicTitle = make("div");
      academicTitle.append(make("p", "eyebrow eyebrow-blue", "ACADEMIC RECORD"), make("h2", "", "Academic progress"));
      academicHeading.append(academicTitle, make("span", "muted", "Marks out of 100"));
      academicCard.append(academicHeading);
      const grid = make("div", "subject-grid");
      student.marks.forEach((mark, index) => {
        const subject = make("div", "subject-card");
        subject.append(make("span", "summary-label", "SUBJECT " + (index + 1)), make("strong", "", mark + "%"));
        const bar = make("div", "meter");
        const fill = make("span");
        fill.style.width = Math.max(0, Math.min(100, Number(mark))) + "%";
        bar.append(fill);
        subject.append(bar);
        grid.append(subject);
      });
      academicCard.append(grid);
      const insights = make("div", "insight-grid");
      insights.append(make("div", "insight-item", "Behavior: " + (student.behavior || "Not set")), make("div", "insight-item", "Academic performance: " + (student.performance || "Not set")));
      academicCard.append(insights);
      host.append(academicCard);

      const notificationsCard = make("section", "content-card");
      const notificationHeading = make("div", "section-heading");
      const nTitle = make("div");
      nTitle.append(make("p", "eyebrow eyebrow-blue", "CAMPUS UPDATES"), make("h2", "", "Notifications"));
      notificationHeading.append(nTitle);
      notificationsCard.append(notificationHeading);
      if (!linkedNotifications.length) {
        notificationsCard.append(make("p", "empty-state", "There are no notifications for this student yet."));
      } else {
        const list = make("div", "notification-list");
        linkedNotifications.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((item) => {
          const article = make("article", "notification-item" + (item.read ? "" : " notification-unread"));
          const top = make("div", "notification-top");
          top.append(make("span", "category-tag", item.category), make("time", "muted", new Date(item.date).toLocaleString()));
          article.append(top, make("h3", "", item.title), make("p", "", item.message));
          if (!item.read) {
            const readButton = make("button", "button button-small button-outline", "Mark as read");
            readButton.type = "button";
            readButton.addEventListener("click", function () {
              const latest = CampusCare.notifications();
              const target = latest.find((entry) => entry.id === item.id && entry.usn === student.usn);
              if (!target) {
                CampusCare.showMessage(message, "This notification is no longer available.", "error");
                return;
              }
              target.read = true;
              CampusCare.saveNotifications(latest);
              render();
            });
            article.append(readButton);
          } else {
            article.append(make("span", "read-label", "Read"));
          }
          list.append(article);
        });
        notificationsCard.append(list);
      }
      host.append(notificationsCard);
      CampusCare.showMessage(message, "", "");
    } catch (error) {
      CampusCare.showMessage(message, error.message, "error");
    }
  }

  render();
}());
