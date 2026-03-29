# TI4 Companion App — Deployment Guide

> From zero to live URL in ~20 minutes. No paid accounts required.

---

## What You'll End Up With

- A live URL like `https://ti4-companion.vercel.app` that you share with players
- Real-time game sync across all phones (~200ms latency)
- Free forever for personal use (Supabase free tier: 500MB DB, Vercel hobby: unlimited)

---

## Prerequisites

- A computer with a terminal (Mac, Windows with Git Bash, or Linux)
- [Node.js](https://nodejs.org) v18 or later — check with `node -v`
- [Git](https://git-scm.com) — check with `git --version`
- A GitHub account (free) — [github.com](https://github.com)
- A Supabase account (free) — [supabase.com](https://supabase.com)
- A Vercel account (free) — [vercel.com](https://vercel.com) — sign in with GitHub

---

## Step 1 — Set Up Supabase (5 min)

### 1.1 Create a project

1. Go to [app.supabase.com](https://app.supabase.com) and sign in
2. Click **New project**
3. Fill in:
   - **Name:** `ti4-companion` (or anything you like)
   - **Database password:** generate a strong one and save it somewhere
   - **Region:** pick the closest to you
4. Click **Create new project** — it takes ~2 minutes to provision

### 1.2 Run the database schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Open the file `supabase-schema.sql` from this project
4. Copy the entire contents and paste into the SQL editor
5. Click **Run** — you should see "Success. No rows returned"

### 1.3 Enable Realtime

1. Go to **Database** → **Replication** in the left sidebar
2. Under **Source**, find the `games` table
3. Toggle it **on**

> If you don't see a Replication menu, go to **Database** → **Publications** → `supabase_realtime` → **Tables** → add `games`.

### 1.4 Get your API keys

1. Go to **Project Settings** (gear icon, bottom-left) → **API**
2. Copy two values:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon / public key** — a long JWT string starting with `eyJ...`

Keep these handy for Step 3.

---

## Step 2 — Set Up the Project Locally (3 min)

### 2.1 Create the project folder

Copy all the project files into a folder on your computer. Your folder structure should look like:

```
ti4-companion/
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── supabaseClient.js
│   ├── data/
│   │   └── gameData.js
│   ├── components/
│   │   ├── SetupScreen.jsx
│   │   ├── Dashboard.jsx
│   │   ├── PlayerRow.jsx
│   │   ├── AgendaPhase.jsx
│   │   ├── RulesLookup.jsx
│   │   └── TradeLog.jsx
│   └── hooks/
│       └── useGameState.js
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── supabase-schema.sql
└── .env.example
```

### 2.2 Install dependencies

Open a terminal in the `ti4-companion` folder and run:

```bash
npm install
```

This downloads React, Vite, Tailwind, and the Supabase client. Takes ~30 seconds.

---

## Step 3 — Configure Environment Variables (2 min)

### 3.1 Create your .env file

In the `ti4-companion` folder, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### 3.2 Fill in your Supabase values

Open `.env` in any text editor and replace the placeholders:

```
VITE_SUPABASE_URL=https://abcdefghijk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Use the values you copied in Step 1.4.

> ⚠️ Never commit `.env` to Git. It's already in `.gitignore` if you use the standard Vite template. Add it manually if not.

---

## Step 4 — Test Locally (2 min)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You should see the TI4 Companion landing screen.

Test the full flow:
1. Click **Create Game** and go through setup
2. Note the room code shown in the top bar
3. Open a second browser tab, go to the same URL
4. Click **Join Game** and enter the room code
5. Make a change in one tab — it should appear in the other within ~1 second

If that works, you're ready to deploy.

---

## Step 5 — Deploy to Vercel (5 min)

### 5.1 Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Create a new **private** repository on [github.com](https://github.com/new) named `ti4-companion`, then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/ti4-companion.git
git branch -M main
git push -u origin main
```

### 5.2 Import to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New → Project**
3. Find and select your `ti4-companion` repository
4. Vercel will auto-detect it as a Vite project — leave all settings as default
5. Before clicking Deploy, expand **Environment Variables** and add:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |

6. Click **Deploy**

Vercel builds and deploys in ~1 minute. You'll get a URL like:
`https://ti4-companion-username.vercel.app`

### 5.3 Set a custom domain (optional)

In Vercel → your project → **Settings** → **Domains**, you can add a custom domain if you have one. Otherwise the `.vercel.app` URL works fine.

---

## Step 6 — Share With Players

Send players the Vercel URL. That's it.

**To start a game:**
1. One player (the host) opens the URL and clicks **Create Game**
2. They go through setup, then the room code appears in the top bar (tap to reveal)
3. Host shares the 6-character code with other players
4. Everyone else clicks **Join Game** and enters the code
5. All players see the same live game state

**Bookmark tip:** Players should add the URL to their phone's home screen (Share → Add to Home Screen in Safari/Chrome) for an app-like experience.

---

## Ongoing Maintenance

### Updating the app

Make changes to the code locally, test with `npm run dev`, then:

```bash
git add .
git commit -m "Description of changes"
git push
```

Vercel auto-deploys every push to `main`. The new version is live in ~1 minute.

### Monitoring

- **Supabase Dashboard → Database → Tables → games**: see all active game rows
- **Vercel Dashboard → your project → Deployments**: see build history and logs
- **Vercel Dashboard → Analytics**: see traffic (if enabled)

### Cleanup old games

Old game rows accumulate in Supabase. To clean them up, run this in the Supabase SQL Editor:

```sql
delete from public.games where created_at < now() - interval '7 days';
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Missing Supabase environment variables" | Check your `.env` file has both variables, no extra spaces |
| "Room not found" when joining | Double-check the 6-character code; codes are case-insensitive |
| Changes not syncing in real-time | Go to Supabase → Database → Replication and confirm `games` table is enabled |
| Build fails on Vercel | Check the Environment Variables are set in Vercel dashboard, not just locally |
| Blank white screen | Open browser console (F12) — likely a missing env var or Supabase connection error |
| "Failed to fetch" errors | Your Supabase project may be paused (free tier pauses after 1 week of inactivity) — go to Supabase dashboard and click Resume |

### Supabase free tier limits

The free tier is generous for a board game app:
- 500MB database storage (a TI4 game state is ~10KB per row)
- 2GB bandwidth per month
- Projects pause after **1 week of inactivity** — just click Resume in the dashboard
- To prevent pausing: upgrade to the $25/month Pro tier, or simply visit the dashboard once a week

---

## Security Notes

The app uses Supabase's anon key, which is safe to expose in frontend code. Row-level security policies are set so:
- Anyone can read a game if they have the room code
- Anyone can update a game (trust is enforced at the app layer via host permissions)
- There is no user authentication — the room code is the access control

This is appropriate for a friends-and-family board game app. If you want stricter access control, Supabase supports full auth (email/password, OAuth) — see [supabase.com/docs/guides/auth](https://supabase.com/docs/guides/auth).
