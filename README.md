# CA Helper

CA Helper is a web app for small businesses in India and Chartered Accountants (CAs).

- A business fills in its details once. The app then works out which tax filings it has to do (GST returns, TDS returns, income tax return) and shows their due dates in a calendar.
- The business can file a return itself (the app gives a checklist and simple steps), or it can find a verified CA in the app and send them a request.
- The CA accepts the work, asks the business for documents, and marks each filing as filed.
- An admin checks each CA's certificate before the CA is shown to businesses.

The app never files anything on the government portal. It only keeps track of the work.

The project has two parts:
- backend/ - a Python Flask server that has all the logic and talks to the database
- frontend/ - a React website that the user sees in the browser

The content/ folder has text and rules for each tax form, kept as JSON files so they can be changed without touching the code.


## How to run it

You need Docker. You also need a PostgreSQL database (we used an online one).

1. Make a file called `.env` in the main folder with these values:
   - `DATABASE_URL` - link to your PostgreSQL database
   - `SECRET_KEY` and `JWT_SECRET_KEY` - any long random text
   - `FIELD_ENCRYPTION_KEY` - a Fernet key (used to encrypt PAN, GSTIN, phone and uploaded files)
2. Start everything: `docker compose up`
3. The first time only, load the rules into the database: `docker compose run backend python seed.py`
4. Open the app at http://localhost:5173
5. Emails (OTP codes, notifications) do not go out for real. You can see them at http://localhost:8025 (Mailpit).
6. To send deadline reminders, start the worker too: `docker compose --profile worker up worker`

Note: there is no sign-up for admins. To make an admin, change the user's `role` to `admin` in the `users` table. The list of NIC codes (business activity codes) also has to be put into the `nic_codes` table in the database; the app only searches it.


## Folder structure

```
CA-helper/
  docker-compose.yml
  .gitignore
  backend/
   |_ app.py,
   |_models.py, 
   |_ helpers.py, 
   |_ filings.py, 
   |_ ocr.py
   |_ routes_auth.py, 
   |_ routes_business.py, 
   |_ routes_documents.py,
   |_ routes_marketplace.py,
   |_ routes_ca.py,
   |_ routes_admin.py
   |_ seed.py,
   |_ reminders.py,
   |_ requirements.txt
   |_ templates/email/ (templates of email)

  content/
    |_forms/   (one folder per form: 24Q, 26Q, CMP-0, GSTR-1, GSTR-3B, GSTR-4, ITR)
    |_reference/gst_states.json

  frontend/
    |_index.html,
    |_ package.json,
    |_ vite.config.js
    src/
      |_main.jsx,
      |_ routes.jsx,
      |_ auth.jsx,
      |_ api.js,
      |_ lib.js,
      |_ index.css
      components/   (shared.jsx, ui.jsx)
      pages/  
        |_AuthPages.jsx,
        |_ SettingsPage.jsx,
        |_ business/
           |_ CalenderPage.jsx
           |_ DashboardPage.jsx
           |_ DocumentsPage.jsx
           |_ EngagementsPage.jsx
           |_ FilingPage.jsx
           |_ FindCaPage.jsx
           |_ OnBoardingPage.jsx
        |_ ca/
          |_ ClientsPage.jsx
          |_ DashboardPage.jsx
          |_ EngagementPage.jsx
          |_ ProfilePage.jsx
        |_ admin/
          |_ AdminPages.jsx
```   


## What each file does

### Main folder

| File | What it does |
|---|---|
| docker-compose.yml | Starts the backend (port 8000), the frontend (port 5173) and Mailpit for emails (port 8025). The reminder worker is also in here but only starts when asked. |
| .gitignore | Keeps secrets (.env), node_modules and other local files out of git. |

### backend/

| File | What it does |
|---|---|
| app.py | Starting point of the backend. Reads settings from .env, connects to the database, sets up login tokens (JWT) and loads all the route files. |
| models.py | All database tables (users, businesses, filings, documents, CAs, requests, ratings, notifications and so on). PAN, GSTIN, TAN and phone are saved encrypted. |
| helpers.py | Small functions used everywhere: checking the user's role, password hashing, sending emails, saving and encrypting uploaded files, checking a GSTIN. |
| filings.py | Makes the list of filings for a business and their due dates, based on its profile. Also handles the document checklist, marking a filing as filed, and checking an uploaded acknowledgement. |
| ocr.py | Reads text from an uploaded PDF or photo. Used to fill the business form from a GST certificate or PAN card, to guess the type of a document, and to read the ARN number and date from an acknowledgement. |
| routes_auth.py | Sign up, email OTP, login, forgot/reset password, email settings and the notification inbox. |
| routes_business.py | Business profile (register and edit), NIC code search, dashboard numbers, compliance calendar, one filing's page, marking it filed or undoing it, and the late fee estimate. |
| routes_documents.py | Document vault: upload, open, delete, link a file to a filing, and the business's side of CA document requests. |
| routes_marketplace.py | CA profile and certificate, CA prices, "Find a CA" list, sending a request to a CA, accept / decline / withdraw / complete, and ratings. |
| routes_ca.py | The CA's work area: list of clients, one client's filings, deadline batches, asking the client for a document, and marking a filing as filed. |
| routes_admin.py | Admin dashboard numbers, list of users, and checking a CA's certificate to verify or reject them. |
| seed.py | Run once to load the fixed data into the database: list of CA services, legal limits (like the GST and audit limits), due-date rules and penalty rules. |
| reminders.py | Background worker. Every 15 minutes it marks late filings as overdue, and once a day (after 8:15 AM) it sends reminder notifications and emails to the business owner and to their CA (if a CA is working on that filing). |
| requirements.txt | Python packages the backend needs. |
| templates/email/*.txt | Text of each email the app sends: verify_email, reset_password, password_changed, notification, reminders, engagement_requested, engagement_accepted, engagement_declined, ca_verified, ca_rejected. |

### content/

| File | What it does |
|---|---|
| forms/<form>/checklist.json | Documents needed for that form (shown as a checklist). |
| forms/<form>/explanation.json | What the form is, in simple words. |
| forms/<form>/instructions.json | Steps to file the form yourself on the government portal. |
| reference/gst_states.json | All states with their GST state code (used to check the first two digits of a GSTIN). |

There is one folder each for 24Q, 26Q, CMP-08, GSTR-1, GSTR-3B, GSTR-4 and ITR.

### frontend/

| File | What it does |
|---|---|
| index.html | The single HTML page the React app loads into. |
| package.json | Frontend packages and the commands to run it. |
| vite.config.js | Settings for Vite (the dev server). It sends every /api call to the backend on port 8000. |
| src/main.jsx | Starting point of the website. Sets up the router, data loading and login. |
| src/routes.jsx | List of all pages and their URLs, the side menu for each role, and the check that only the right role can open a page. |
| src/auth.jsx | Keeps the logged-in user and token, and handles login and logout. |
| src/api.js | Every call to the backend is written here, in one place. Adds the login token to each call. |
| src/lib.js | Common helpers: form rules (email, password, OTP), labels shown on screen, date and rupee formatting, GSTIN check. |
| src/index.css | Colours, font and Tailwind setup. |
| src/components/ui.jsx | Basic building blocks: button, card, input, select, badge, label. |
| src/components/shared.jsx | Bigger pieces used on many pages: form fields, tables, error messages, page titles, star rating, status badges, engagement cards. |
| src/pages/AuthPages.jsx | Home page, terms page, login, sign up, verify email, forgot password, reset password, and the "page not found" page. |
| src/pages/SettingsPage.jsx | Notification inbox and the "email me my notifications" switch (for business and CA). |

frontend/src/pages/business/ - pages for the business owner

| File | What it does |
|---|---|
| DashboardPage.jsx | Next deadline, counts (due this month, overdue, with a CA), late fee total and the to-do list. |
| OnboardingPage.jsx | Register or edit the business (with auto-fill from a GST certificate or PAN card), the profile summary, and choosing the NIC code. |
| CalenderPage.jsx | Compliance calendar: all filings by month, with filters for form and status. |
| FilingPage.jsx | One filing: late fee estimate, file yourself or get a CA, document checklist with files, mark as filed, and how-to steps. |
| DocumentsPage.jsx | Document vault: upload, list, open and delete files. |
| FindCaPage.jsx | Find a CA (search and filters), one CA's profile with prices and reviews, and the page to send a request. |
| EngagementsPage.jsx | The business's requests to CAs: waiting, active, finished; withdraw a request; rate a CA. |

frontend/src/pages/ca/ - pages for the CA

| File | What it does |
|---|---|
| DashboardPage.jsx | CA home page. |
| ProfilePage.jsx | CA profile and certificate upload (My profile), and the CA's prices (Services & prices). |
| EngagementsPage.jsx | New requests from businesses (accept or decline), active work (mark as completed) and finished engagements. |
| ClientsPage.jsx | My clients, one client's filings (ask for documents, mark filed), and deadline batches. |

frontend/src/pages/admin/

| File | What it does |
|---|---|
| AdminPages.jsx | Admin dashboard, list of users and CAs, and one CA's page to open the certificate and verify or reject. |
