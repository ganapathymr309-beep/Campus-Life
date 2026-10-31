# CampusCare project guide

## What this project is

CampusCare is a local demonstration portal for administrator, student, and
parent workflows. Student and academic records remain in browser localStorage.
A loopback-only Node.js server adds automatic parent email notifications,
Resend API delivery, and persistent notification history. Do not use real student or
family information: account authentication and student-record authorization
remain demo-only.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `login.js` | Role selection, basic form validation, and demo routing |
| `admin.html`, `admin.js` | Student CRUD, academic/attendance classifications, email notification controls, and Excel tools |
| `student.html`, `student.js` | Current student's profile, academic record, and classifications |
| `parent.html`, `parent.js` | Linked student's progress and parent notifications |
| `data.js` | Seed records, localStorage persistence, and shared status classifications |
| `server.js` | Static website, local API, Resend configuration, and HTTP request handling |
| `notification-service.js` | Classification, templates, idempotency, delivery history, and retry logic |
| `test/notification-service.test.js` | Threshold, template, recipient, duplicate, failure/retry, and API tests |
| `style.css` | Shared responsive and accessible visual styles |
| `.env.example` | Safe email API configuration template; contains no secrets |
| `.vscode/settings.json` | Configures optional VS Code Live Server on port 5500 |
| `run-portal.bat` | Starts the website and backend on Windows |
| `package.json`, `package-lock.json` | Pin the existing Excel dependency and define project scripts |
| `README.txt` | Setup, email configuration, behavior, and security limitations |

## Run locally on Windows

Install Node.js 18+ and, in the project folder, run `npm ci`. Start the portal
and backend together with `npm start`, then open
`http://127.0.0.1:3000/index.html`. Alternatively, double-click `run-portal.bat`.

The default `EMAIL_MODE=console` is safe test mode: messages are recorded but
not sent. To use a Resend sandbox, copy `.env.example` to `.env`, configure
`RESEND_API_KEY` and `EMAIL_FROM`, set `EMAIL_MODE=resend`, and restart the server. `.env` and
`.campuscare/` are excluded from Git. Run `npm test` for automated tests; those
tests use a fake transport and do not verify external inbox delivery.

The optional VS Code Live Server can serve the page on port 5500 while `npm
start` runs the API on port 3000. Python's static HTTP server does not provide
the notification API.

## Demo roles and authorization boundaries

- Administrator can manage records, import/export workbooks, and access parent
  email history, preview, manual send, failed-only filtering, and retry.
- Student activation matches roster USN and student email, chooses a password,
  and associates the session with that record's stable ID.
- Parent sees the student record matching the parent's account email and can
  mark that student's in-app notifications as read.

Student activation stores a salted PBKDF2 password hash in localStorage.
Administrator and parent login remain demonstration-only and accept any
non-empty passphrase. Student data and role checks can be inspected or changed
in the browser. The backend binds to 127.0.0.1 by default and keeps provider
credentials out of client code, but this is not production authentication.
Production use requires server-side student data and sessions, authorization
for every API request, enforced parent/student relationships, and secure
persistent storage.

## Notification behavior

Attendance is Eligible at 85% or above, Borderline from 75% to below 85%, and
Not Eligible below 75%. Academic status uses the average of existing subject
marks: Good at 85% or above, Average from 60% to below 85%, and Poor below 60%.
The feature never adds or alters marks.

When the admin page opens, the backend initializes only missing status
snapshots; it does not send emails. Saving or importing records evaluates the
latest status. One email is generated per changed classification, and unchanged
statuses do not generate duplicates. New records establish a baseline without
an initial status-change email. Delivery failures are stored and may be
retried from the admin history.

Notification history and classification snapshots are in
`.campuscare/notifications.json`. Student and academic records continue to be
stored in the browser's localStorage. Excel import/export keeps its existing
`Students`, `Academic`, and `Notifications` sheets and USN join behavior.

## Extending for deployment

1. Move student records and notification snapshots to a secured database.
2. Replace demo sign-in with server-side authentication and role authorization.
3. Enforce parent/student relationships on the server; do not trust browser
   sessions or client-supplied student data.
4. Configure a provider sandbox, test actual delivery, and monitor failures.
5. Remove sample identities and ensure sensitive data is never exposed to
   unauthorized roles.
