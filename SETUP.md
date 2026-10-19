# Reflections: setup guide

The site works right away as a demo. Everything you do is saved on your own phone or computer, and nothing is shared between people yet. The steps below turn on the real version. Do them in order. Each step works without the ones after it.

## 0. Put the site online (5 minutes)

1. Open your repo on GitHub: **MariahsAI/My-Reflections**.
2. Delete the old `index.html`. Then choose **Add file → Upload files**.
3. Drag in **everything inside this folder**: `index.html`, `app.html`, `config.js`, `manifest.webmanifest`, `sw.js`, and the `assets`, `icons` and `supabase` folders. Keep the folder names the same.
4. Choose **Commit changes**. After a minute or two:
   - Landing page: https://mariahsai.github.io/My-Reflections/
   - App: https://mariahsai.github.io/My-Reflections/app.html

To install it on a phone, open the app link. On iPhone, use Safari's **Share → Add to Home Screen**. On Android, use **Install app**.

## 1. Real accounts, shared feed and waitlist (Supabase, free tier, about 20 minutes)

Until you do this step, waitlist emails on the landing page are saved only in that visitor's browser. **You will not receive them.**

1. Create a project at https://supabase.com.
2. Open **SQL Editor → New query**. Paste in all of `supabase/schema.sql` and choose **Run**.
3. Open **Project Settings → API** and copy two values: the **Project URL** and the **anon public** key.
4. Open `config.js` on GitHub and choose the pencil icon to edit it. Paste in both values and commit:
   ```js
   supabaseUrl: "https://YOURPROJECT.supabase.co",
   supabaseAnonKey: "eyJ...",
   ```
5. While you're testing, you can skip confirmation emails: in **Authentication → Sign In / Providers → Email**, turn off **Confirm email**. Turn it back on before launch.

After this step:
- Sign up and log in create real accounts.
- New posts go to the shared feed.
- Waitlist emails land in the `waitlist` table. Find them in **Table Editor → waitlist**.

## 2. Real AI songs (about 20 minutes, paid API usage)

You need two API keys:
- **Anthropic** writes the lyrics: https://console.anthropic.com
- **ElevenLabs** sings the song: https://elevenlabs.io. Its music API needs a paid plan.

1. Install the Supabase CLI and log in. Then run these from this folder:
   ```
   supabase link --project-ref YOURPROJECT
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ELEVENLABS_API_KEY=...
   supabase functions deploy generate
   ```
2. In `config.js`, set the function's address:
   ```js
   generateUrl: "https://YOURPROJECT.supabase.co/functions/v1/generate"
   ```

Now **Generate** makes a real song with real lyrics, and the play button plays it. If the AI is busy or fails, the app shows the demo song instead of breaking.

Keep your API keys in Supabase secrets. They must never go in `config.js` or anywhere else on GitHub. Before a public launch, add limits so strangers can't run up your bill. For example, allow a set number of songs a day per account, and only one free song for people without an account.

**Video:** "Video story" writes the script but doesn't make the film yet. When Viddo AI or another video service offers an API, add the call where the function says *Video generation is not connected yet*.

## 3. Still to build before charging real money

The prototype shows these, but they need more work:

- **Payments.** Tips, exclusive unlocks, gift extras and cash-outs say "test mode" and no money moves. Stripe Checkout and Stripe Connect are the usual way to charge fans and pay creators. Exclusive posts also need their media kept private until someone pays.
- **Song pages with previews.** Each song needs its own link that shows its cover when shared. GitHub Pages can't do this. It needs a host that builds pages on request, such as Vercel or Netlify, or a Supabase function.
- **Daily reminders.** Push notifications need a server that sends them on a schedule.
- **Moderation.** Before opening to the public, you need reporting, blocking and a review of what the AI is asked to write.
