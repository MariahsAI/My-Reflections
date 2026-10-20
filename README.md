# Reflections

Toggle your reality. Reflections is a social app built on flip posts: you post the real moment, prompt it, and AI makes its reflection (a film, a song, a music video or your AI character). Everyone slides the toggle to see what never happened.

- `index.html` is the landing page, with an early-access waitlist.
- `app.html` is the app itself. It can be installed to a phone's home screen.
- `config.js` holds the switches for real accounts and real AI. It's blank by default, which runs the demo.
- `SETUP.md` explains how to put the site online and connect everything, step by step.
- `terms.html` and `privacy.html` are draft legal pages. Have a lawyer review them before launch.
- `supabase/` holds the database setup (`schema.sql`) and two AI functions: `generate` (songs) and `video` (Film studio). Shared login, limit and credit checks are in `functions/_shared/guard.ts`.
