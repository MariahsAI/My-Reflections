// Reflections AI: story in, song out.
// 1) Claude writes a title and lyrics from the person's story.
// 2) ElevenLabs Music sings it.
// 3) The MP3 is saved to the "songs" storage bucket and its link is returned.
//
// Secrets to set (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY, ELEVENLABS_API_KEY
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const toSecs = (len: string) => {
  const [m, s] = String(len || "0:45").split(":").map(Number);
  return (m || 0) * 60 + (s || 0) || 45;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const { prompt, format = "song", vibe = "Sad indie", length = "0:45" } = await req.json();
    const story = String(prompt || "").trim();
    if (!story || story.length > 500) return json({ error: "Tell us your story in up to 500 characters." }, 400);
    const secs = Math.min(Math.max(toSecs(length), 10), 120);

    // 1) Lyrics
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
        messages: [{ role: "user", content: `Story: ${story}\nSound: ${vibe}\nLength: about ${secs} seconds` }],
      }),
    });
    if (!lr.ok) throw new Error("lyrics " + lr.status + " " + (await lr.text()));
    const lj = await lr.json();
    const text: string = lj.content?.[0]?.text ?? "{}";
    const song = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    if (!song.title || !Array.isArray(song.lyrics)) throw new Error("bad lyrics JSON");

    if (format !== "song") {
      // Video generation is not connected yet. Return the script so the app can show it.
      return json({ title: song.title, lyrics: song.lyrics, videoUrl: null });
    }

    // 2) Music
    const mr = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY")!, "content-type": "application/json" },
      body: JSON.stringify({
        prompt: `${vibe} song with vocals, titled "${song.title}". Sing these lyrics:\n${song.lyrics.join("\n")}`,
        music_length_ms: secs * 1000,
      }),
    });
    if (!mr.ok) throw new Error("music " + mr.status + " " + (await mr.text()));
    const audio = new Uint8Array(await mr.arrayBuffer());

    // 3) Save and return a link
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.mp3`;
    const up = await admin.storage.from("songs").upload(path, audio, { contentType: "audio/mpeg" });
    if (up.error) throw up.error;
    const { data } = admin.storage.from("songs").getPublicUrl(path);
    return json({ title: song.title, lyrics: song.lyrics, audioUrl: data.publicUrl });
  } catch (e) {
    console.error(e);
    return json({ error: "We couldn't make your song this time. Try again." }, 500);
  }
});
