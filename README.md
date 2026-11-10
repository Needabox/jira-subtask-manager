# Jira Subtask Manager

A professional, high-performance, client-only React + TypeScript application for bulk creating Jira Subtasks from Excel, monitoring assigned subtasks in real time, and maintaining persistent import history locally with IndexedDB.

Built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **shadcn/ui**, **TanStack Query v5**, **SheetJS (xlsx)**, and **IndexedDB (`idb`)**.

---

## 🎯 Key Features

1. **Excel Bulk Import Engine**
   - Download official 12-column `.xlsx` template.
   - Client-side drag-and-drop file upload and validation using SheetJS.
   - Header order and naming validation against strict business specification.
   - `Estimasi (jam)` column is preserved in the Excel template, but strictly ignored during validation and Subtask payload construction.
   - Asynchronous metadata validation against Jira Cloud REST API (project check, parent issue capability, user assignment resolution, project components, and priorities).
   - Duplicate detection: identifies existing subtasks with matching summary under the parent Story, displaying existing key and status with user controls (`Skip Duplicate` or `Import Anyway`).
   - Controlled concurrency execution pool (1-5 parallel workers) with exponential backoff on HTTP 429 (Rate Limit) and transient network failures.
   - Partial success support: failures on individual rows do not abort subsequent rows.
   - Row-level execution logs with direct clickable Jira issue links.

2. **My Assigned Tasks (Strictly Read-Only)**
   - JQL query: `assignee = currentUser() AND issuetype in subTaskIssueTypes() ORDER BY duedate ASC`.
   - Real-time search, status category filtering (`To Do`, `In Progress`, `Done`), priority filtering, and overdue indicators.
   - Overdue calculation: `Due Date < Current Date` AND `Status Category != Completed`.
   - Zero update/mutation controls (no edit, delete, reassign, or bulk update).

3. **Persistent Local Import History**
   - Browser-side IndexedDB persistence using `idb`.
   - Tracks session date, file name, total rows, success, failed, duplicates, and skipped rows.
   - Detailed per-row audit trail.
   - **Export Failed Rows to Excel**: exports failed items in the original 12-column layout + appends `Import Status`, `Error`, and `Error Detail` for instant re-import.

4. **Jira Integration & Settings**
   - Supports Jira Cloud API Token (Session memory only, zero credential storage on disk/localStorage).
   - Supports Atlassian OAuth 2.0 (3LO) authorization flow.
   - Dynamic auto-discovery of Start Date custom field with manual fallback selector.
   - Subtask issue type override configuration.
   - Configurable import concurrency and duplicate handling preferences.

---

## 📐 Excel Template Specification

Headers must be present in this **EXACT order**:

| # | Column Header | Status | Behavior / Mapping |
|---|---|---|---|
| 1 | `Story Key` | Required | Jira issue key of parent Story (e.g. `PROJ-101`) |
| 2 | `Subtask (Summary)` | Required | Subtask summary title (max 255 chars) |
| 3 | `Assignee (nama/email)` | Required | Name or email resolved to Jira `accountId` |
| 4 | `Start Date` | Required | `YYYY-MM-DD` or Excel serial date (mapped to custom field) |
| 5 | `Due Date` | Required | `YYYY-MM-DD` or Excel serial date (mapped to `duedate`) |
| 6 | `Estimasi (jam)` | Ignored | Required in template header, **completely ignored** in import |
| 7 | `Reporter (nama/email)` | Required | Name or email resolved to Jira `accountId` |
| 8 | `Component 1` | Required | Verified against target project components |
| 9 | `Component 2` | Optional | Verified against target project components |
| 10 | `Component 3` | Optional | Verified against target project components |
| 11 | `Priority` | Required | Verified against Jira priorities (`Highest`, `High`, etc.) |
| 12 | `Deskripsi (opsional)` | Optional | Converted to Atlassian Document Format (ADF) |

---

## 🔒 Security & Architecture Rules

- **Zero Backend Architecture:** 100% frontend. No Node/Express/Golang backend, no PostgreSQL/MySQL/Redis.
- **Credential Safety:** Sensitive API tokens and OAuth access tokens are stored only in memory or active session storage. They are never logged to console or persisted to localStorage.
- **Resilience:** Requests to Jira API feature automatic exponential backoff with jitter on HTTP 429 (Rate Limit) and transient network disconnects.

---

## 🚀 Getting Started

### 1. Installation

```bash
npm install
```

### 2. Development Server

```bash
npm run dev
```

App runs on `http://localhost:3000`.

### 3. Run Automated Tests

```bash
npm test
```

### 4. Build for Production

```bash
npm run build
```

---

## 🧪 Automated Test Suite

- `src/tests/excel-parser.test.ts`: Template structure, exact 12 headers, ignored `Estimasi (jam)`, empty row skipping.
- `src/tests/dates.test.ts`: ISO dates, slash dates, Excel serial numbers, `Start Date <= Due Date`, overdue rules.
- `src/tests/validation.test.ts`: Story Key syntax, required fields, date sanity checks.
