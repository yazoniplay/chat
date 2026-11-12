# Tuffchat 💬

A WhatsApp-inspired chat app for your friend group, built with React, TypeScript, Vite and Supabase.

## Features in this starter
- Email/password sign up and login with unique usernames
- Search people by username and start direct conversations
- Create group chats and add members
- Realtime text messaging
- Emoji picker
- Optional Tenor GIF search (configure an API key)
- Responsive WhatsApp-inspired dark green interface
- Supabase Row Level Security policies for private conversations and messages

## Run locally
1. Install Node.js 18+.
2. Clone the repo and run `npm install`.
3. Create a free project at [Supabase](https://supabase.com/dashboard).
4. Run `supabase/migrations/0001_tuffchat.sql` in the Supabase SQL Editor.
5. Copy `.env.example` to `.env.local`, then fill in your Supabase project URL and publishable/anon key.
6. Run `npm run dev`.

## Optional GIF search
Set `VITE_TENOR_API_KEY` in `.env.local` to enable GIF search. Emoji and text messages work without it.

## Security
Never put a Supabase service-role/secret key in this frontend. Use only the publishable/anon key; database access is protected by RLS. Configure your Supabase Auth redirect URLs before deploying.

## Next upgrades
Presence, typing indicators, read receipts, reactions, image uploads, notifications and deployment.
