# Reflections: setup guide

The site works right away as a demo. Everything you do is saved on your own phone or computer, nothing is shared between people, and songs and films are sample previews (the app labels them "Demo preview"). The landing page says early-access sign-up "opens soon" until step 1 is done, so no emails are lost.

Do the steps in order. Each one works without the ones after it.

## 0. Put the site online (5 minutes)

1. Open your repo on GitHub: **MariahsAI/My-Reflections**.
2. Choose **Add file → Upload files**.
3. Drag in **everything inside this folder**, keeping the folder names the same. That includes `index.html`, `app.html`, `terms.html`, `privacy.html`, `config.js`, `manifest.webmanifest`, `sw.js`, and the `assets`, `icons` and `supabase` folders.
4. Choose **Commit changes**. After a minute or two:
   - Landing page: https://mariahsai.github.io/My-Reflections/
   - App: https://mariahsai.github.io/My-Reflections/app.html

To install it on a phone, open the app link. On iPhone, use Safari's **Share → Add to Home Screen**. On Android, use **Install app**.

## 1. Real accounts, shared feed and waitlist (Supabase, free tier, about 20 minutes)

1. Create a project at https://supabase.com.
2. Open **SQL Editor → New query**. Paste in all of `supabase/schema.sql` and choose **Run**. This creates the tables, the security rules and the credit system.
3. Open **Authentication → Sign In / Providers** and turn on **Anonymous sign-ins**. This lets visitors make their one free song before creating an account.
4. Open **Project Settings → API Keys** and copy the **Publishable key** (it starts with `sb_publishable_`). Then open **Project Settings → Data API** and copy the **Project URL**.
   - Older projects show an "anon public" key (it starts with `eyJ`). That works too.
5. Open `config.js` on GitHub, choose the pencil icon, fill in both values and commit:
   ```js
   supabaseUrl: "https://YOURPROJECT.supabase.co",
   supabaseKey: "sb_publishable_...",
   ```
6. While you're testing, you can skip confirmation emails: in **Authentication → Sign In / Providers → Email**, turn off **Confirm email**. Turn it back on before launch.

After this step:
- Sign up and log in create real accounts.
- New posts go to the shared feed.
- The waitlist form appears on the landing page, and emails land in the `waitlist` table. Find them in **Table Editor → waitlist**.

## 2. Real AI songs and films (paid API usage)

You need these keys:
- **Anthropic** writes the lyrics: https://console.anthropic.com
- **ElevenLabs** sings the songs: https://elevenlabs.io. The music API needs a paid plan, and an app where users make and earn from songs most likely needs an OEM or enterprise agreement. **Get that in writing before launch.**
- **fal.ai** makes the films: https://fal.ai

1. Install the Supabase CLI and log in. Then run these from this folder:
   ```
   supabase link --project-ref YOURPROJECT
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ELEVENLABS_API_KEY=... FAL_KEY=...
   supabase secrets set SERVICE_KEY=sb_secret_...        # Project Settings → API Keys → Secret key
   supabase secrets set ALLOWED_ORIGIN=https://mariahsai.github.io
   supabase secrets set MODEL_DEFAULT=<fal endpoint> MODEL_SEEDANCE_2=bytedance/seedance-2.0/text-to-video
   supabase functions deploy generate --no-verify-jwt
   supabase functions deploy video --no-verify-jwt
   ```
   `--no-verify-jwt` is needed with the new API keys. The functions check who is signed in themselves.
2. For each video model you offer, copy its endpoint ID from fal.ai/models and set `MODEL_<ID>`, plus `MODEL_<ID>_I2V` for the image-to-video version. Any model without its own endpoint uses `MODEL_DEFAULT`.
3. In `config.js`, set:
   ```js
   generateUrl: "https://YOURPROJECT.supabase.co/functions/v1/generate",
   videoUrl: "https://YOURPROJECT.supabase.co/functions/v1/video"
   ```

**What protects your bill:**
- Every request must come from a signed-in account. Guests are signed in anonymously and get exactly one song.
- **Credits live in the database.** Free accounts get 500 a month and Creator gets 5,000, refilled monthly. The functions charge before calling the AI and refund the credits if a song fails. The number in the app is only a display copy.
- **Daily limits per account:** 30 songs, 60 lyric drafts and 10 films.

**What's real and what's "coming soon":**
- **Live once connected:** Story to song, Lyrics to song, Photo to song, Instrumental, Duet, Text to video and Image to video.
- **Coming soon:** all other studio tools (voice cloning, stems, hum to song, music video, lip sync and so on). The app labels them and won't charge for them.
- **Song model:** only Eleven Music is connected. The other music models show "soon".
- **Video models:** any fal-hosted video model works once its endpoint is set. Runway isn't on fal, so it shows "soon".
- **Seedance on fal:** goes up to 720p, so the app turns off 1080p for it.

Videos take 1 to 5 minutes, and the app waits and shows progress. If a film fails after it has started, the credits are not refunded automatically. Check `generation_log` and refund by hand for now.

## 3. Before charging real money or opening to the public

- **Legal pages.** `terms.html` and `privacy.html` are drafts with [brackets] to fill in. Have a lawyer review them, along with the age requirement (13+), the AI providers' terms, and consent for anything using a real person's voice or face.
- **Payments.** Tips, paid unlocks, gift extras and cash-outs say "test mode", and no money moves. Use Stripe Checkout and Stripe Connect. Set the creator share, payout minimum and fee handling so each sale covers card fees. A $1.99 unlock at 85% to the creator doesn't cover a typical $0.30 card fee.
- **Play earnings.** Decide where that money comes from (subscriptions, ads, a creator fund) before promising it.
- **Paid posts.** Upload paid media to the private `exclusive` bucket and add a row to `exclusive_media`, never to `posts.media_url`. Your payment webhook writes to `unlocks` with the secret key.
- **Song pages with previews.** Each song needs its own link that shows its cover when shared. GitHub Pages can't do this. It needs a host that builds pages on request, such as Vercel or Netlify, or a Supabase function.
- **Moderation.** The `reports` table is ready. You still need a review process and blocking.
- **Daily reminders.** Push notifications need a server that sends them on a schedule.
