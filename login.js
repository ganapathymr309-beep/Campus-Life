(function () {
  "use strict";

  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  const routes = { admin: "admin.html", student: "student.html", parent: "parent.html" };
  const roleInput = document.getElementById("role");
  const usernameLabel = document.getElementById("username-label");
  const passwordLabel = document.getElementById("password-label");
  const passwordHint = document.getElementById("password-hint");
  const activationForm = document.getElementById("student-activation-form");
  const activationMessage = document.getElementById("activation-message");
  const activationButton = document.getElementById("show-activation");
  const activationUsn = document.getElementById("activation-usn");
  const activationEmail = document.getElementById("activation-email");
  const loginButton = form.querySelector("button[type='submit']");
  const activationSubmit = activationForm.querySelector("button[type='submit']");
  let loginBusy = false;
  let activationBusy = false;

  function updateLoginHelp() {
    if (roleInput.value === "student") {
      usernameLabel.textContent = "Student USN";
      passwordLabel.textContent = "Password";
      passwordHint.textContent = "Sign in with the password you chose when activating this student account.";
    } else if (roleInput.value === "parent") {
      usernameLabel.textContent = "Registered parent name or account email";
      passwordLabel.textContent = "Student USN or demo passphrase";
      passwordHint.textContent = "Use the linked student's USN when signing in with a parent name. Email sign-in accepts any non-empty value.";
    } else {
      usernameLabel.textContent = "Username or account email";
      passwordLabel.textContent = "Demo passphrase";
      passwordHint.textContent = "Any non-empty value is accepted; it is not checked or stored.";
    }
    activationButton.hidden = roleInput.value !== "student";
    if (roleInput.value !== "student") activationForm.hidden = true;
  }

  roleInput.addEventListener("change", updateLoginHelp);
  activationButton.addEventListener("click", function () {
    activationForm.hidden = false;
    activationUsn.focus();
  });
  document.getElementById("cancel-activation").addEventListener("click", function () {
    activationForm.reset();
    activationForm.hidden = true;
    CampusCare.showMessage(activationMessage, "", "");
  });

  activationForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (activationBusy) return;
    CampusCare.showMessage(activationMessage, "", "");
    const usn = activationUsn.value.trim();
    const email = activationEmail.value.trim();
    const password = document.getElementById("activation-password").value;
    const confirmation = document.getElementById("activation-confirm").value;

    if (!usn || !email || !password || !confirmation) {
      CampusCare.showMessage(activationMessage, "Enter the USN, registered student email, and both password fields.", "error");
      return;
    }
    if (password.length < 8) {
      CampusCare.showMessage(activationMessage, "Choose a password with at least 8 characters.", "error");
      return;
    }
    if (password !== confirmation) {
      CampusCare.showMessage(activationMessage, "The passwords do not match.", "error");
      return;
    }

    activationBusy = true;
    activationSubmit.disabled = true;
    try {
      const student = CampusCare.findStudentByUsn(usn);
      if (!student) {
        CampusCare.showMessage(activationMessage, "No student record matches that USN. Contact the administrator.", "error");
        return;
      }
      if (!student.email || student.email.trim().toLowerCase() !== email.toLowerCase()) {
        CampusCare.showMessage(activationMessage, "That email does not match the email registered on this student record.", "error");
        return;
      }
      await CampusCare.activateStudentAccount(student, password);
      activationForm.reset();
      activationForm.hidden = true;
      document.getElementById("username").value = student.usn;
      CampusCare.showMessage(message, "Student account activated. Sign in with your USN and the password you just chose.", "success");
      document.getElementById("password").focus();
    } catch (error) {
      CampusCare.showMessage(activationMessage, error.message || "Account activation failed. Please try again.", "error");
    } finally {
      activationBusy = false;
      activationSubmit.disabled = false;
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (loginBusy) return;
    const role = roleInput.value;
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    CampusCare.showMessage(message, "", "");
    CampusCare.clearSession();

    if (!Object.prototype.hasOwnProperty.call(routes, role)) {
      CampusCare.showMessage(message, "Choose a valid account type.", "error");
      return;
    }
    if (!username || !password.trim()) {
      CampusCare.showMessage(message, "Enter both your username and password.", "error");
      return;
    }

    loginBusy = true;
    loginButton.disabled = true;
    try {
      let account = username;
      if (role === "student") {
        const student = CampusCare.findStudentByUsn(username);
        if (!student) {
          CampusCare.showMessage(message, "No student record matches that USN.", "error");
          return;
        }
        const validPassword = await CampusCare.verifyStudentPassword(student, password);
        if (!validPassword) {
          CampusCare.showMessage(
            message,
            CampusCare.hasStudentAccount(student.id)
              ? "The password is incorrect. Check your password and try again."
              : "This student account is not activated. Set it up using the USN and registered student email.",
            "error"
          );
          return;
        }
        account = student.id;
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
    } finally {
      loginBusy = false;
      loginButton.disabled = false;
    }
  });

  updateLoginHelp();
}());
