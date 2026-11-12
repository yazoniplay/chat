# Tuffchat 💬

A WhatsApp-inspired chat app for your friend group, built with React, TypeScript, Vite and Supabase.

## Features
- Email/password sign up and login with unique usernames
- Search people by username and start direct conversations
- Create group chats and add members
- Realtime text messaging
- Emoji picker and optional Tenor GIF search
- Responsive WhatsApp-inspired dark green interface
- Supabase Row Level Security for private conversations and messages

## Deploy to GitHub Pages
The GitHub Actions workflow at `.github/workflows/deploy.yml` builds and deploys the app whenever you push to `main`.

1. In GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the Actions tab).
4. When the workflow succeeds, the site will be available at [https://yazoniplay.github.io/chat/](https://yazoniplay.github.io/chat/).

The workflow supplies the public Supabase project URL and publishable key at build time. These are designed for browser use; database access is protected by Row Level Security. Never put a Supabase service-role or secret key in this frontend.

## Run locally
1. Install Node.js 18+.
2. Clone the repo and run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project's URL and publishable key.
5. Run `npm run dev`.

## Optional GIF search
Set `VITE_TENOR_API_KEY` in `.env.local` to enable GIF search. Text and emoji messages work without it.

## Supabase
Project ref: `yolajnjkronukrypdcio`. Database schema migrations are in `supabase/migrations/`. Configure Supabase Auth URL settings to allow the deployed site URL, `https://yazoniplay.github.io/chat/`, and the local development URL, `http://localhost:5173`.

