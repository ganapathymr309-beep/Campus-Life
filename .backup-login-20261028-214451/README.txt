CAMPUSCARE — STUDENT MONITORING PORTAL
======================================

This folder contains a browser-only demonstration of a student monitoring portal.
It is not a production authentication or student-information system. Records are
stored in the current browser's localStorage and can be viewed or changed by
anyone with access to that browser. Do not enter real student, family, password,
or other sensitive information.

Run on Windows
--------------
Prerequisites:
- Node.js 18 or newer (includes npm): https://nodejs.org/
- Python 3: https://www.python.org/downloads/
- VS Code Live Server extension, if using the Live Server workflow.

Open PowerShell or Command Prompt in the project folder and install the Excel
library once (required for Excel import/export):

  npm ci

VS Code Live Server (port 5500)
-------------------------------
Open this project folder in VS Code. The included `.vscode/settings.json`
configures Live Server to use port 5500. Click "Go Live" in the VS Code status
bar, then open the page with this PowerShell command:

  Start-Process "http://localhost:5500/index.html"

Alternatively, open `index.html` from the VS Code Explorer and choose "Open
with Live Server". Stop Live Server with the "Port: 5500" status-bar control.

Standalone Python server (alternative)
---------------------------------------
If you are not using Live Server, run:

  python -m http.server 5500 --bind 127.0.0.1

Then open `http://localhost:5500/index.html`. Stop the server with Ctrl+C.
Alternatively, after `npm ci`, double-click `run-portal.bat` to start the
standalone server and open the page. Do not run both servers on port 5500
simultaneously.

The npm dependency is SheetJS (`xlsx` 0.20.3) and is bundled locally for Excel
import/export. Once installed, the portal does not need a network connection to
load Excel support or fonts. There is no backend, database, or AI/ML model in
this frontend-only demonstration.

Demonstration roles
-------------------
Choose Administrator and enter any username; the password field accepts any
non-empty value but is not checked or saved. Student accounts use the USN shown
in the student record. Parent accounts use the parent account email on that
record. Seeded demo identities:

  Administrator: any username
  Student:       CCS2024001, CCS2024002, CCS2024003
  Parent:        parent.rao@example.edu
                 parent.nair@example.edu
                 parent.shah@example.edu

The seeded names, phone numbers, and addresses are fictional examples. Clear
this site's browser storage to reset the sample records and notifications.

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

Architecture and limitations
----------------------------
- index.html/login.js: demonstration role selection and dashboard routing.
- admin.html/admin.js: student management, statistics, notifications, and
  Excel import/export.
- student.html/student.js and parent.html/parent.js: role-filtered browser views.
- data.js: sample data, localStorage access, and browser-session helpers.
- style.css: shared responsive interface styles.

The role and record checks are client-side only. Browser storage is not shared
between devices or users and is not a secure data store. A production deployment
requires a backend API, database, password hashing, secure server-managed
sessions, server-side role authorization, and enforced parent/student
relationships. Never rely on these demo screens or localStorage for privacy.
