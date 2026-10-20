# Reflections

Your thoughts, made into sound and film. Reflections is a social app for posts, reels and stories, where AI turns a moment from your life into a song or a short film.

- `index.html` is the landing page, with an early-access waitlist.
- `app.html` is the app itself. It can be installed to a phone's home screen.
- `config.js` holds the switches for real accounts and real AI. It's blank by default, which runs the demo.
- `SETUP.md` explains how to put the site online and connect everything, step by step.
- `terms.html` and `privacy.html` are draft legal pages. Have a lawyer review them before launch.
- `supabase/` holds the database setup (`schema.sql`) and two AI functions: `generate` (songs) and `video` (Film studio). Shared login, limit and credit checks are in `functions/_shared/guard.ts`.
