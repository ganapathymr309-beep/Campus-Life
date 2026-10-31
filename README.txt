CAMPUSCARE — STUDENT MONITORING PORTAL
======================================

This project contains the CampusCare student, parent, and administrator
demonstration portal plus a local Node.js backend for parent email
notifications. Student and academic records remain in the current browser's
localStorage; notification history and classification snapshots are stored in
`.campuscare`. This is not a production authentication or student-information
system. Do not enter real student, family, password, or other sensitive
information.

Run on Windows
--------------
Prerequisite: Node.js 18 or newer (includes npm): https://nodejs.org/

In PowerShell or Command Prompt, install dependencies once:

  npm ci

Start the website and backend together:

  npm start

Open `http://127.0.0.1:3000/index.html`. Stop the server with Ctrl+C.
Alternatively, double-click `run-portal.bat`. It starts the same local server.

The optional VS Code Live Server workflow remains available: first run `npm
start`, then click "Go Live" (port 5500). Live Server serves the front end while
the notification API runs on port 3000. The Python `http.server` command only
serves static files and does not provide the notification API.

Email configuration
-------------------
The default `EMAIL_MODE=console` is a safe test mode. It records email
notifications but does not deliver email. To enable the Resend email API:

1. Copy `.env.example` to `.env`.
2. Set `EMAIL_MODE=resend` and configure `RESEND_API_KEY` and `EMAIL_FROM`.
3. Use a Resend sandbox/test recipient before real delivery and configure a
   verified sender for production.
4. Restart the backend with `npm start`.

The `.env` file and `.campuscare/` data directory are excluded from Git. Never
put provider credentials in HTML or JavaScript. The admin dashboard displays the
current mode, previews messages, lists delivery history, filters failures,
and allows manual sends and retries. The backend validates the registered
parent email before sending. A provider-accepted result means the server accepted
the message; it does not guarantee delivery to the parent's inbox.

Automatic rules
---------------
- Attendance: Eligible at 85% or above; Borderline from 75% to below 85%;
  Not Eligible below 75%.
- Academic performance: Good at 85% or above; Average from 60% to below 85%;
  Poor below 60%. The average uses existing subject marks; marks are not
  created or changed by this feature.
- Existing classifications are baselined when the admin dashboard opens.
  Admin record saves and workbook imports trigger evaluation. Emails are only
  sent when attendance or academic classification changes; refreshing the
  dashboard does not resend unchanged statuses.
- Failed sends are retained in notification history and can be retried.

Demonstration roles
-------------------
Administrator login remains a demonstration flow: any username and non-empty
passphrase are accepted. To activate an existing student, choose Student,
select "Set up student account", enter the USN and student email already in
the admin roster, and choose a password of at least eight characters. Sign in
with that USN and password afterwards. Activation stores a salted PBKDF2
password hash in this browser; it does not change or replace the student
record.

Parents can sign in with a registered parent name and that student's USN, or
use the parent account email with any non-empty demo passphrase. Seeded demo
identities:

  Administrator: any username
  Student:       CCS2024001, CCS2024002, CCS2024003
  Parent name + student USN:
                 Rohan Rao / CCS2024001
                 Meera Rao / CCS2024001
                 Arun Nair / CCS2024002
                 Anita Nair / CCS2024002
                 Nikhil Shah / CCS2024003
                 Pooja Shah / CCS2024003
  Parent email:  parent.rao@example.edu
                 parent.nair@example.edu
                 parent.shah@example.edu

The seeded names, phone numbers, and addresses are fictional examples. Clear
this site's browser storage to reset sample records and accounts. Notification
history is separate; stop the server and remove the specific `.campuscare`
directory only if you intend to reset that history too.

Excel import/export
-------------------
The administrator dashboard imports and exports .xlsx/.xls files with three
worksheets named Students, Academic, and Notifications. USN/register number is
the join key. The importer normalizes header spelling and punctuation and
recognizes common variations including "Student Number", "Student gmail", and
"Attendence". Choose Merge to retain existing students, or Replace to replace
the student roster after confirmation. Existing notifications are retained in
either mode; imported notifications with new IDs are added. Import reports
validation issues on screen. Export produces CampusCare-data.xlsx.

Files and security limitations
------------------------------
- `admin.html` / `admin.js`: record management, classification display,
  notification controls, and Excel tools.
- `student.html` / `student.js`, `parent.html` / `parent.js`: role-filtered
  dashboards.
- `data.js`: sample records, localStorage helpers, and shared classifications.
- `server.js` / `notification-service.js`: local API, server-side email sending,
  duplicate prevention, and notification history.
- `.campuscare/notifications.json`: local notification data; excluded from Git.
- `.env`: local email provider credentials; excluded from Git.

The server binds to 127.0.0.1 by default. Role checks, account records, student
records, password hashes, and session data are managed in browser storage and
can be inspected or changed by the browser user. The demo login is not
authentication. This backend protects provider credentials from the browser but
does not make the portal production-secure. Production use requires server-side
student records, authentication, authorization, parent/student relationship
enforcement, and a secured database. Never rely on these demo screens or
localStorage for privacy.

Testing
-------
Run `npm test` for classification thresholds, average calculations, email
content, correct parent recipient, deduplication, invalid-address handling,
failed delivery and retry behavior, and API checks. These tests use an injected
test transport; they do not prove delivery to an external inbox. Verify an
actual provider using its sandbox before enabling real parent emails.
