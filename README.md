# Reflections

Make the song. Flip the moment. Get paid when it spreads. Reflections is an AI-powered music creation and social platform built on flip posts: post the real moment, and AI turns it into a song, a film or both. Everyone slides the toggle to see it and can make their own version. Every creation carries Proof of creation, remixes credit and pay the original, and earnings are shown in dollars (invisible on-chain records; demo mode for now).

- `index.html` is the landing page, with an early-access waitlist.
- `app.html` is the app itself. It can be installed to a phone's home screen.
- `config.js` holds the switches for real accounts and real AI. It's blank by default, which runs the demo.
- `SETUP.md` explains how to put the site online and connect everything, step by step.
- `terms.html` and `privacy.html` are draft legal pages. Have a lawyer review them before launch.
- `supabase/` holds the database setup (`schema.sql`) and two AI functions: `generate` (songs) and `video` (Film studio). Shared login, limit and credit checks are in `functions/_shared/guard.ts`.
