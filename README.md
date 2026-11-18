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
   - Supports Atlassian OAuth 2.0 (3LO) authorization flow (with server-side token exchange and automatic refresh via Vercel Serverless Functions).
   - Supports Jira Cloud API Token via same-origin serverless proxy (avoids browser CORS errors).
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

- **Stateless Vercel Serverless Proxy:** No external database (no PostgreSQL/MySQL/Redis) and no standalone backend server. Thin serverless functions in `/api/` handle OAuth token exchange, SSRF-validated Jira REST API proxying (eliminating browser CORS errors), and session management.
- **Credential Safety:** Jira API tokens and OAuth access/refresh tokens are encrypted (AES-256-GCM) inside `HttpOnly; Secure; SameSite=Lax` cookies. Client JavaScript, `localStorage`, and `sessionStorage` never store or read API tokens or OAuth secrets.
- **Resilience:** Requests to Jira API feature automatic exponential backoff with jitter on HTTP 429 (Rate Limit) and transient network disconnects, plus automatic OAuth token refresh.

---

## ☁️ Deploying to Vercel (Step-by-Step Guide)

Follow these steps before and during deployment to Vercel so authentication, `HttpOnly` cookie sessions, OAuth 2.0 (3LO), and SPA routing work securely in production.

### Step 1: Pre-Deploy Verification (Local)

Run the build and automated test suite to verify both the React frontend (`src/`) and Vercel Serverless Functions (`api/`):

```bash
npm run build && npm test
```

Ensure there are no uncommitted `.env` files (only `.env.example` should be tracked in Git; `.gitignore` already excludes `.env`, `.env.*`, `.local`, and `.vercel`).

---

### Step 2: Generate `SESSION_SECRET` (Required)

The serverless proxy encrypts Jira sessions into `HttpOnly` cookies using **AES-256-GCM**. You must provide a random secret of at least 16 characters (32+ bytes / 64 hex chars recommended).

Generate one locally with OpenSSL or Node.js:

```bash
# Using OpenSSL
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the generated string for Step 5.

> ⚠️ **Important:** Without `SESSION_SECRET` configured in Vercel, login attempts will be rejected with a configuration warning in `/settings`.

---

### Step 3: *(Optional)* Configure Atlassian OAuth 2.0 (3LO) App

Skip this step if your team only plans to connect using individual **Jira Cloud API Tokens** (`email` + `apiToken` via the *Jira API Token (Proxied)* tab).

If you want one-click **Authorize with Atlassian (OAuth 2.0 3LO)** login:

1. Go to the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps).
2. Click **Create** → **OAuth 2.0 integration** and name your app (e.g., `Jira Subtask Manager`).
3. Open **Permissions** → **Jira API** → **Configure**, then add these exact scopes:
   - **Classic / Granular Jira scopes required by this app:**
     - `read:jira-work`
     - `write:jira-work`
     - `read:jira-user`
   - **User identity API:**
     - `read:me`
   - *(Automatically enabled with refresh tokens)*: `offline_access`
4. Open **Authorization** → **Configure** (for OAuth 2.0 3LO) and set the **Callback URL** to match your Vercel production domain:
   ```text
   https://<your-vercel-project>.vercel.app/settings
   ```
   *(If using a custom domain, add `https://<your-custom-domain>/settings` as well.)*
5. Open **Settings** in the Atlassian app dashboard and copy your:
   - **Client ID** → `JIRA_OAUTH_CLIENT_ID`
   - **Secret** → `JIRA_OAUTH_CLIENT_SECRET`

---

### Step 4: Import Project in Vercel

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In the [Vercel Dashboard](https://vercel.com/new), click **Add New... → Project** and import your repository.
3. Verify the **Build & Output Settings** (Vercel auto-detects Vite):
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build` *(runs `tsc`, `tsc -p tsconfig.api.json --noEmit`, and `vite build`)*
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
   - **Node.js Version:** `20.x` or `22.x`

---

### Step 5: Configure Environment Variables in Vercel

Before clicking **Deploy** (or inside **Project Settings → Environment Variables**):

| Variable Name | Required? | Environment | Description |
|---|---|---|---|
| `SESSION_SECRET` | **Yes** | Production, Preview | Secret key (min. 16 chars, recommended 64 hex chars from Step 2) for encrypting `HttpOnly` session cookies. |
| `JIRA_OAUTH_CLIENT_ID` | Optional *(Req. for OAuth)* | Production, Preview | Atlassian OAuth 2.0 (3LO) Client ID from Step 3. |
| `JIRA_OAUTH_CLIENT_SECRET` | Optional *(Req. for OAuth)* | Production, Preview | Atlassian OAuth 2.0 (3LO) Client Secret from Step 3. Stays strictly server-side in `/api/`. |

> 🔒 **Security Note:** Never prefix `SESSION_SECRET` or `JIRA_OAUTH_CLIENT_SECRET` with `VITE_`. Variables without `VITE_` are never bundled into frontend JavaScript.

If you updated Environment Variables **after** an initial deployment, trigger a **Redeploy** from the Vercel Deployments tab so the serverless functions pick up the new values.

---

### Step 6: Routing & Security Headers (`vercel.json`)

The included [`vercel.json`](./vercel.json) automatically handles:
- **SPA Routing Fallback:** Rewrites non-file, non-API routes (`/import`, `/my-tasks`, `/history`, `/settings`) to `/index.html` so refreshing subpages does not return `404`.
- **Serverless API Isolation:** Preserves `/api/*` requests (`api/auth/*`, `api/jira.ts`) directly to Vercel Serverless Functions.
- **Security Headers:** Sets `Cache-Control: no-store` on `/api/*`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.

---

### Step 7: Post-Deploy Verification Checklist

1. Open `https://<your-vercel-project>.vercel.app/settings`.
2. Confirm there is **no red banner** warning about missing `SESSION_SECRET`.
3. Test authentication:
   - **API Token Mode:** Enter your `https://<site>.atlassian.net`, Atlassian Email, and API Token → click **Connect to Jira Cloud**. Verify your name & avatar appear and remain connected after refreshing the page (`Cmd/Ctrl + R`).
   - **OAuth 2.0 Mode:** Confirm the OAuth tab shows `Server Configured` → click **Authorize with Atlassian**, approve access, and confirm redirect back to `/settings` connects cleanly.
4. Open Browser DevTools → **Application**:
   - Confirm `localStorage` and `sessionStorage` contain **zero** Jira API tokens or OAuth access tokens.
   - Confirm `Cookies` shows `jira_session` marked `HttpOnly`, `Secure`, and `SameSite=Lax`.
5. Refresh `/import` or `/my-tasks` directly in the browser address bar to verify SPA routing returns `200 OK` instead of `404`.

---

### Troubleshooting Common Vercel Issues

- **Error: `SESSION_SECRET is not configured in Vercel Environment Variables`**
  - Add `SESSION_SECRET` in Vercel **Project Settings → Environment Variables**, ensure the right environments (Production/Preview) are checked, and redeploy.
- **OAuth Callback Fails with `redirect_uri` Mismatch**
  - Make sure the Callback URL in Atlassian Developer Console matches your exact active domain + `/settings` (e.g., Preview URLs have different subdomains than Production URLs).
- **OAuth Callback Fails with `OAuth state verification failed`**
  - Always start login from the same domain/protocol you return to (do not start on a Vercel Preview URL and return to Production URL).
- **Session Lost Immediately After Login**
  - Verify `SESSION_SECRET` has at least 16 characters and you are accessing the site over `https://`.

---

## 🚀 Getting Started (Local Development)

### 1. Installation

```bash
npm install
```

### 2. Development Server

```bash
npm run dev
```

App runs on `http://localhost:3000` with `/api/*` middleware active locally. Optional env vars can be placed in `.env.local` (see `.env.example`).

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
- `src/tests/serverless-security.test.ts`: AES-256-GCM cookie encryption/decryption, 4KB cookie chunking, SSRF URL & endpoint blocking.
- `src/tests/api-handlers.test.ts`: Serverless API handlers (`/api/auth/config`, `/api/auth/session`, `/api/auth/logout`, `/api/jira`).

