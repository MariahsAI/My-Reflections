// Reflections AI: story in, song out.
// 1) Claude writes a title and lyrics from the person's story.
// 2) ElevenLabs Music sings it.
// 3) The MP3 is saved to the "songs" storage bucket and its link is returned.
//
// Secrets to set (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY, ELEVENLABS_API_KEY
// SUPABASE_URL is provided automatically. If your project uses the new API keys, also set SERVICE_KEY
// to your secret key (sb_secret_...). Deploy with --no-verify-jwt: the function checks the user itself.

import { admin, charge, cors, getUser, json, logGen, refund, songCost, underLimit } from "../_shared/guard.ts";
const toSecs = (len: string) => {
  const [m, s] = String(len || "0:45").split(":").map(Number);
  return (m || 0) * 60 + (s || 0) || 45;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let paid: { id: string; cost: number } | null = null;
  try {
    const body = await req.json();
    const { format = "song", vibe = "Sad indie", length = "0:45", style, ownLyrics, idea, title, instrumental, image, lyricsOnly } = body;
    const story = String(body.prompt || idea || "").trim();
    if (!story && !ownLyrics && !image && !instrumental) return json({ error: "Tell us your story, add lyrics or add a photo." }, 400);
    if (story.length > 500 || String(ownLyrics || "").length > 2800 || String(style || "").length > 300) return json({ error: "That's a bit long. Shorten it and try again." }, 400);
    const secs = Math.min(Math.max(toSecs(length), 10), 180);
    const sound = String(style || vibe);

    // Who is asking, and can they afford it?
    const user = await getUser(req);
    if (!user) return json({ error: "Please sign in to make a song." }, 401);
    const guest = !!user.is_anonymous;
    const kind = lyricsOnly ? "lyrics" : "song";
    if (!(await underLimit(user.id, kind, guest)))
      return json({ error: guest ? "Create a free account to make more songs." : "You've hit today's limit. Try again tomorrow." }, 429);
    const cost = lyricsOnly ? 0 : songCost("eleven-music", secs);
    const balance = await charge(user.id, cost, `song ${secs}s`);
    if (balance < 0) return json({ error: "Not enough credits.", needCredits: cost }, 402);
    paid = { id: user.id, cost };

    // 1) Lyrics: use theirs, skip for instrumental, or write them (from the story and/or the photo)
    let song: { title: string; lyrics: string[] };
    if (ownLyrics) {
      const lines = String(ownLyrics).split("\n").map((l: string) => l.trim()).filter(Boolean);
      song = { title: title || lines.find((l: string) => !/^\[.*\]$/.test(l))?.slice(0, 40) || "untitled", lyrics: lines };
    } else if (instrumental && !lyricsOnly) {
      song = { title: title || "untitled (instrumental)", lyrics: [] };
    } else {
    const userContent: unknown[] = [];
    const m = typeof image === "string" ? image.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/) : null;
    if (m && m[2].length < 4_000_000) userContent.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
    userContent.push({ type: "text", text: `Story: ${story || "(none, write about the photo)"}\nSound: ${sound}\nLength: about ${secs} seconds` });
    const lr = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("LYRICS_MODEL") ?? "claude-haiku-5-5",
        max_tokens: 700,
        system:
          "You write short, original song lyrics from a person's real story. Use plain words and specific images from their story. " +
          "Never imitate a real artist and never reuse existing lyrics. " +
          'Reply with JSON only, shaped {"title": string, "lyrics": string[]}, with 8 to 12 short lowercase lines.',
        messages: [{ role: "user", content: userContent }],
      }),
    });
    if (!lr.ok) throw new Error("lyrics " + lr.status + " " + (await lr.text()));
    const lj = await lr.json();
    const text: string = lj.content?.[0]?.text ?? "{}";
    song = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!song.title || !Array.isArray(song.lyrics)) throw new Error("bad lyrics JSON");
    if (title) song.title = title;
    }
    if (lyricsOnly) { await logGen(user.id, "lyrics", "claude", 0); return json({ title: song.title, lyrics: song.lyrics }); }

    if (format !== "song") {
      // Films are made by the video function. Here we only return the script.
      return json({ title: song.title, lyrics: song.lyrics, videoUrl: null, credits: balance });
    }

    // 2) Music
    const mr = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY")!, "content-type": "application/json" },
      body: JSON.stringify({
        prompt: instrumental || !song.lyrics.length
          ? `${sound}, instrumental only, no vocals. Mood: ${story || song.title}`
          : `${sound} song with vocals, titled "${song.title}". Sing these lyrics:\n${song.lyrics.join("\n")}`,
        music_length_ms: secs * 1000,
        model_id: Deno.env.get("MUSIC_MODEL") ?? "music_v2",
      }),
    });
    if (!mr.ok) throw new Error("music " + mr.status + " " + (await mr.text()));
    const audio = new Uint8Array(await mr.arrayBuffer());

    // 3) Save and return a link
    const db = admin();
    const path = `${user.id}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.mp3`;
    const up = await db.storage.from("songs").upload(path, audio, { contentType: "audio/mpeg" });
    if (up.error) throw up.error;
    const { data } = db.storage.from("songs").getPublicUrl(path);
    await logGen(user.id, "song", "eleven-music", cost);
    return json({ title: song.title, lyrics: song.lyrics, audioUrl: data.publicUrl, credits: balance });
  } catch (e) {
    console.error(e);
    if (paid) await refund(paid.id, paid.cost).catch(() => {});
    return json({ error: "We couldn't make your song this time. Your credits were returned." }, 500);
  }
});
