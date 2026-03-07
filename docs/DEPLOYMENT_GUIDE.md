# EduResult Pro — Complete Backend & Deployment Guide

## Table of Contents
1. Project Structure
2. Local Development Setup
3. How the Backend Works
4. API Reference
5. Default Accounts
6. Free Hosting Options (No Credit Card)
7. Deploy to Render.com (Recommended Free)
8. Deploy to Railway.app
9. Deploy with Docker
10. Custom Domain Setup (Free)
11. Production Checklist
12. Troubleshooting

---

## 1. Project Structure

```
eduresult-pro/
├── backend/
│   ├── server.js          ← Main Express + SQLite server
│   ├── package.json       ← Node.js dependencies
│   ├── .env.example       ← Copy to .env and edit
│   └── data/
│       └── eduresult.db   ← SQLite database (auto-created)
│
├── frontend/
│   ├── index.html         ← Your full EduResult Pro app
│   └── api-client.js      ← Bridges frontend ↔ backend
│
├── Dockerfile             ← For Docker deployment
├── docker-compose.yml     ← For Docker Compose
├── render.yaml            ← For Render.com auto-deploy
├── railway.json           ← For Railway.app auto-deploy
└── .gitignore
```

---

## 2. Local Development Setup

### Requirements
- Node.js 18+ (download: https://nodejs.org)
- npm (comes with Node.js)

### Step 1 — Install dependencies
```bash
cd eduresult-pro/backend
npm install
```

### Step 2 — Configure environment
```bash
cp .env.example .env
# Edit .env if needed (defaults work fine for local dev)
```

### Step 3 — Connect frontend to backend
Open `frontend/index.html` and add this line just before `</body>`:
```html
<script src="api-client.js"></script>
```

### Step 4 — Start the server
```bash
# From inside backend/
node server.js

# Or with auto-reload (install nodemon first: npm install -g nodemon)
nodemon server.js
```

### Step 5 — Open in browser
```
http://localhost:3000
```

### Default login credentials
| Username  | Password     | Role    |
|-----------|-------------|---------|
| admin     | admin123    | Admin   |
| teacher   | teacher123  | Teacher |

> **IMPORTANT:** Change these passwords immediately after first login!

---

## 3. How the Backend Works

### Technology Stack
- **Runtime:** Node.js 18+
- **Framework:** Express.js 4.x
- **Database:** SQLite via better-sqlite3 (zero server setup)
- **Auth:** JWT tokens (7-day expiry)
- **Security:** Helmet.js, CORS, rate limiting, bcrypt password hashing

### Database
SQLite stores everything in a single file: `backend/data/eduresult.db`
- No database server needed
- Automatic backups via `/api/backup` endpoint
- WAL mode for concurrent reads

### Authentication Flow
1. POST `/api/auth/login` → returns JWT token
2. All other requests include: `Authorization: Bearer <token>`
3. Tokens expire after 7 days

### Frontend Integration
The `api-client.js` file:
- Overrides `doLogin()` to authenticate against the real server
- Auto-restores session if a valid token exists
- Patches `saveDB()` to sync to server in background
- Loads data from server on login, falls back to localStorage if offline

---

## 4. API Reference

### Auth
| Method | Endpoint                  | Description            |
|--------|--------------------------|------------------------|
| POST   | /api/auth/login          | Login, get JWT token   |
| POST   | /api/auth/change-password| Change own password    |
| GET    | /api/auth/me             | Get current user info  |

### Settings
| Method | Endpoint       | Description                  |
|--------|---------------|------------------------------|
| GET    | /api/settings  | Get school settings          |
| PUT    | /api/settings  | Update school settings       |

### Students
| Method | Endpoint            | Description          |
|--------|--------------------|-----------------------|
| GET    | /api/students       | List all students     |
| POST   | /api/students       | Add student (admin)   |
| PUT    | /api/students/:id   | Update student (admin)|
| DELETE | /api/students/:id   | Delete student (admin)|

### Subjects
| Method | Endpoint                  | Description                    |
|--------|--------------------------|--------------------------------|
| GET    | /api/subjects/:term       | List subjects (term=mid/final/monthly) |
| POST   | /api/subjects/:term       | Add subject (admin)            |
| PUT    | /api/subjects/:id         | Update subject (admin)         |
| DELETE | /api/subjects/:id         | Delete subject (admin)         |
| PUT    | /api/subjects/bulk/:term  | Replace all subjects for term  |

### Marks
| Method | Endpoint        | Description              |
|--------|----------------|--------------------------|
| GET    | /api/marks/:term| Get all marks for term   |
| PUT    | /api/marks      | Save single mark         |
| POST   | /api/marks/bulk | Save many marks at once  |

### Monthly
| Method | Endpoint                        | Description            |
|--------|---------------------------------|------------------------|
| GET    | /api/monthly/:month             | Get month data         |
| PUT    | /api/monthly/:month/mark        | Save monthly mark      |
| PUT    | /api/monthly/:month/attendance  | Save attendance        |
| PUT    | /api/monthly/:month/meta        | Save month metadata    |

### Admin
| Method | Endpoint     | Description          |
|--------|-------------|----------------------|
| GET    | /api/backup  | Download JSON backup |
| GET    | /api/users   | List users (admin)   |
| POST   | /api/users   | Create user (admin)  |
| DELETE | /api/users/:id | Delete user (admin)|
| GET    | /api/dashboard| Dashboard stats      |
| GET    | /api/audit   | Audit log (admin)    |
| GET    | /api/health  | Health check         |

---

## 5. Default Accounts

After first run, two accounts are created automatically:

**Admin Account**
- Username: `admin`
- Password: `admin123`
- Can: add/edit/delete students, manage subjects, manage users, download backup

**Teacher Account**
- Username: `teacher`
- Password: `teacher123`
- Can: view students, enter marks

---

## 6. Free Hosting Options

### Option A — Render.com ⭐ (Best Free Option)
- **Free tier:** 750 hours/month (enough for 1 service 24/7)
- **Persistent disk:** 1 GB free (keeps your SQLite database)
- **Custom domain:** Free subdomain + custom domain support
- **Auto-deploy:** Push to GitHub → auto deploys
- URL: https://render.com

### Option B — Railway.app
- **Free tier:** $5 credit/month (enough for light usage)
- **Persistent storage:** Available
- URL: https://railway.app

### Option C — Fly.io
- **Free tier:** 3 shared VMs + 3 GB persistent storage
- Best for production-grade free hosting
- URL: https://fly.io

### Option D — VPS (Cheapest Paid)
- Hostinger VPS: ~$4/month
- DigitalOcean: $6/month
- Both give full control

---

## 7. Deploy to Render.com (Step-by-Step)

### Step 1 — Push code to GitHub
```bash
# Create a GitHub account at github.com if you don't have one

# Initialize git in your project folder
cd eduresult-pro
git init
git add .
git commit -m "Initial commit — EduResult Pro"

# Create new repo on github.com (click + → New repository)
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/eduresult-pro.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy on Render
1. Go to https://render.com and sign up (free, no credit card)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account
4. Select your `eduresult-pro` repository
5. Render auto-detects `render.yaml` — click **"Apply"**
6. Set these environment variables:
   - `JWT_SECRET` → click "Generate" for a random value
   - `NODE_ENV` → `production`
7. Click **"Create Web Service"**
8. Wait ~3 minutes for first deploy
9. Your app is live at: `https://eduresult-pro-xxxx.onrender.com`

### Step 3 — Add your frontend HTML
The `render.yaml` already serves `frontend/index.html` automatically.

---

## 8. Deploy to Railway.app

### Step 1 — Push to GitHub (same as above)

### Step 2 — Deploy
1. Go to https://railway.app and sign up with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select `eduresult-pro`
4. Railway reads `railway.json` automatically
5. Go to **Variables** tab and add:
   - `JWT_SECRET` = any long random string
   - `NODE_ENV` = `production`
   - `DB_PATH` = `/app/backend/data/eduresult.db`
6. Go to **Settings** → **Domains** → click **"Generate Domain"**
7. App is live in ~2 minutes

---

## 9. Deploy with Docker

### Local Docker
```bash
# Build
docker build -t eduresult-pro .

# Run
docker run -d \
  -p 3000:3000 \
  -v eduresult_data:/app/backend/data \
  -e JWT_SECRET="your_secret_here" \
  -e NODE_ENV=production \
  --name eduresult \
  eduresult-pro

# Open http://localhost:3000
```

### Docker Compose (Easier)
```bash
# Edit docker-compose.yml → change JWT_SECRET
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Deploy Docker to a VPS
```bash
# SSH into your server
ssh user@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Copy your project files
scp -r eduresult-pro/ user@your-server-ip:~/

# Run
cd ~/eduresult-pro
docker-compose up -d
```

---

## 10. Custom Domain Setup (Free)

### Get a free domain
- **Freenom:** `.tk`, `.ml`, `.ga` domains (free)
- **js.org:** For project pages
- **Or buy:** Namecheap `.com` ~$9/year, `.site` ~$1/year

### Connect domain to Render.com
1. In Render dashboard → your service → **Settings** → **Custom Domains**
2. Click **"Add Custom Domain"**
3. Enter your domain (e.g., `results.myschool.com`)
4. Render gives you a CNAME record value
5. Go to your domain registrar's DNS settings
6. Add a CNAME record:
   - **Name:** `results` (or `@` for root)
   - **Value:** the CNAME from Render
7. Wait 10-30 minutes for DNS propagation
8. HTTPS is automatically enabled (free SSL via Let's Encrypt)

### Connect domain to Railway.app
1. Railway dashboard → **Settings** → **Domains** → **Custom Domain**
2. Same process — add CNAME in your DNS

---

## 11. Production Checklist

Before going live, make sure you:

- [ ] Changed `admin` password (Settings → Profile)
- [ ] Changed `teacher` password
- [ ] Set a strong `JWT_SECRET` (32+ random characters)
- [ ] Set `NODE_ENV=production`
- [ ] Set specific `CORS_ORIGINS` (not `*`)
- [ ] Tested backup download works
- [ ] Set up regular backup schedule (weekly download)
- [ ] Connected your domain

### Generate a strong JWT_SECRET
```bash
# Run this in terminal (Linux/Mac):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Or use: https://generate-secret.vercel.app/48
```

---

## 12. Troubleshooting

### "Cannot find module 'better-sqlite3'"
```bash
cd backend
npm install
```

### "Port 3000 already in use"
```bash
# Find and kill the process
lsof -i :3000       # Mac/Linux
netstat -ano | findstr :3000   # Windows

# Or change port in .env:
PORT=4000
```

### "Database is locked"
SQLite WAL mode handles this. If persists:
```bash
cd backend/data
sqlite3 eduresult.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### "Login fails on first run"
The database is created on first start. Wait 5 seconds and retry.

### App is slow on Render free tier
Free tier "spins down" after 15 minutes of inactivity.
First request after sleep takes ~30 seconds.
Fix: Use https://uptimerobot.com (free) to ping your app every 14 minutes.

### Reset all data
```bash
cd backend/data
rm eduresult.db
# Restart server — fresh database created
```

---

## Support

For issues, open a GitHub issue on your repo or check:
- Express docs: https://expressjs.com
- better-sqlite3 docs: https://github.com/WiseLibs/better-sqlite3
- Render docs: https://render.com/docs
