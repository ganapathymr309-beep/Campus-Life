# CampusCare project guide

## What this project is

CampusCare is a static, browser-local demonstration portal for administrator,
student, and parent workflows. The supplied workspace contained no pre-existing
source files or `student_data.xlsx`, so this project was created from the
provided requirements and sample records. It is not production-secure and must
not be used with real student or family information.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `login.js` | Role selection, basic form validation, and demo routing |
| `admin.html`, `admin.js` | Student CRUD/search, dashboard statistics, notifications, and Excel tools |
| `student.html`, `student.js` | Read-only view of the current student's profile and academic record |
| `parent.html`, `parent.js` | Linked student's progress and parent notifications |
| `data.js` | Seed records, localStorage persistence, and demo session helpers |
| `style.css` | Shared responsive and accessible visual styles |
| `.vscode/settings.json` | Configures VS Code Live Server to use port 5500 |
| `run-portal.bat` | Starts the standalone static HTTP server on Windows |
| `package.json`, `package-lock.json` | Pin the SheetJS Excel dependency |
| `README.txt` | Quick-start instructions and demo account identities |

## Run locally on Windows

Install Node.js 18+ and Python 3. In the project folder, run `npm ci` to install
the pinned SheetJS 0.20.3 Excel library locally. For VS Code Live Server, open
the folder in VS Code, click "Go Live", then open
`http://localhost:5500/index.html` (the workspace setting pins Live Server to
port 5500). From PowerShell, launch that URL with
`Start-Process "http://localhost:5500/index.html"`.

Alternatively, run `python -m http.server 5500 --bind 127.0.0.1` and open the
same URL, or double-click `run-portal.bat`. Do not start both servers on the
same port. No database or AI/ML model is used. The installed Excel library and
system fonts are local, so the app does not need a CDN connection.

## Demo roles and authorization boundaries

- Administrator can add, edit, search, delete, import, and export records, and
  send or delete notifications.
- Student sees the record matching the entered USN.
- Parent sees the student record matching the parent's account email, and can
  mark that student's notifications as read.

The password field is present for demonstration flow only: any non-empty value
is accepted, never verified, and never stored. Role checks and student/parent
record filtering run in JavaScript and are not an authorization boundary.
Anyone with browser access can inspect or modify localStorage. For production,
replace this with a backend API and a database (for example PostgreSQL), hash
passwords with a suitable password-hashing algorithm, use secure server-managed
sessions, and authorize every record and notification request on the server.
The server must enforce parent-to-student associations rather than trusting a
client-supplied USN.

## Data and workbook behavior

The initial fictional sample data is written to browser localStorage on first
use. Student records include a linked parent email, five subject marks,
attendance, behavior, and academic performance. Notifications persist across
browser restarts in the same browser profile. Clearing site data removes these
records.

Excel import expects `Students`, `Academic`, and `Notifications` worksheets and
matches student/academic/notification data by USN. Header names are normalized;
known variations include `Student Number`, `Student gmail`, and `Attendence`.
Blank optional cells do not overwrite existing merge-mode values. Merge keeps
students not present in the workbook. Replace asks for confirmation and
replaces the student roster, but preserves all existing notifications; new
workbook notifications are added only when their IDs are not already present.
The export workbook contains all three worksheets. The original workbook was
not available in the workspace, so its specific headers could not be inspected.

## Extending for deployment

1. Add a backend API and persistent database schema for users, students,
   parent/student relationships, academic records, and notifications.
2. Move authentication and all authorization checks to the server.
3. Validate input on the server and use parameterized database operations.
4. Add automated unit/integration tests and verify Excel mappings against the
   actual institution workbook before importing real data.
5. Remove the sample identities and ensure sensitive data is never exposed to
   unauthorized roles.
