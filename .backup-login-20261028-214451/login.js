(function () {
  "use strict";

  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  const routes = { admin: "admin.html", student: "student.html", parent: "parent.html" };

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const role = document.getElementById("role").value;
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    CampusCare.showMessage(message, "", "");

    if (!role || !username || !password) {
      CampusCare.showMessage(message, "Choose an account type and enter both fields.", "error");
      return;
    }

    try {
      let account = username;
      if (role === "student") {
        const student = CampusCare.students().find((item) => item.usn.toLowerCase() === username.toLowerCase());
        if (!student) {
          CampusCare.showMessage(message, "No student record matches that USN.", "error");
          return;
        }
        account = student.usn;
      } else if (role === "parent") {
        const student = CampusCare.students().find((item) => item.parentEmail.toLowerCase() === username.toLowerCase());
        if (!student) {
          CampusCare.showMessage(message, "No parent account matches that email.", "error");
          return;
        }
        account = student.parentEmail;
      }

      CampusCare.setSession({ role: role, account: account });
      window.location.assign(routes[role]);
    } catch (error) {
      CampusCare.showMessage(message, error.message, "error");
    }
  });
}());
