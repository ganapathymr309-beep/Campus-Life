(function () {
  "use strict";

  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  const routes = { admin: "admin.html", student: "student.html", parent: "parent.html" };
  const roleInput = document.getElementById("role");
  const usernameLabel = document.getElementById("username-label");
  const passwordLabel = document.getElementById("password-label");
  const passwordHint = document.getElementById("password-hint");

  function updateLoginHelp() {
    if (roleInput.value === "student") {
      usernameLabel.textContent = "Student USN";
      passwordLabel.textContent = "Demo passphrase";
      passwordHint.textContent = "Any non-empty value is accepted; it is not checked or stored.";
    } else if (roleInput.value === "parent") {
      usernameLabel.textContent = "Registered parent name or account email";
      passwordLabel.textContent = "Student USN or demo passphrase";
      passwordHint.textContent = "Use the linked student's USN when signing in with a parent name. Email sign-in accepts any non-empty value.";
    } else {
      usernameLabel.textContent = "Username or account email";
      passwordLabel.textContent = "Demo passphrase";
      passwordHint.textContent = "Any non-empty value is accepted; it is not checked or stored.";
    }
  }

  roleInput.addEventListener("change", updateLoginHelp);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const role = roleInput.value;
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    CampusCare.showMessage(message, "", "");
    CampusCare.clearSession();

    if (!Object.prototype.hasOwnProperty.call(routes, role)) {
      CampusCare.showMessage(message, "Choose a valid account type.", "error");
      return;
    }
    if (!username || !password) {
      CampusCare.showMessage(message, "Enter both your username and password.", "error");
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
        const students = CampusCare.students();
        const student = students.find((item) => {
          const emailMatches = item.parentEmail && item.parentEmail.toLowerCase() === username.toLowerCase();
          const parentNameMatches = [item.fatherName, item.motherName].some((name) =>
            name && name.trim().toLowerCase() === username.toLowerCase()
          );
          return emailMatches || (parentNameMatches && item.usn.toLowerCase() === password.toLowerCase());
        });
        if (!student) {
          CampusCare.showMessage(message, "Parent sign-in failed. Use a registered parent name with that student's USN, or a registered parent email.", "error");
          return;
        }
        account = student.usn;
      }

      CampusCare.setSession({ role: role, account: account });
      window.location.assign(routes[role]);
    } catch (error) {
      CampusCare.showMessage(message, error.message || "Sign-in failed. Please try again.", "error");
    }
  });

  updateLoginHelp();
}());
