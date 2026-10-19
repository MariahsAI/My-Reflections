// Reflections Film studio: starts a video job on fal.ai and checks on it.
// fal hosts many video models (Kling, Veo, Seedance, Hailuo, Wan, Pixverse and more) behind one key.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FAL_KEY        your fal.ai API key
//   MODEL_<ID>     the fal endpoint for each model you offer, copied from fal.ai/models, for example
//                  MODEL_SEEDANCE_2=bytedance/seedance-2.0/text-to-video
//                  Add one ending in _I2V for the image-to-video version, e.g. MODEL_SEEDANCE_2_I2V.
//   MODEL_DEFAULT  used for any model without its own endpoint
//   SERVICE_KEY    your Supabase secret key, if your project uses the new API keys
// Deploy with --no-verify-jwt: the function checks the user itself.
import { charge, cors, getUser, json, logGen, refund, underLimit, videoCost } from "../_shared/guard.ts";

const envKey = (id: string) => "MODEL_" + id.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
const endpointFor = (model: string, withImage: boolean) =>
  (withImage && Deno.env.get(envKey(model) + "_I2V")) || Deno.env.get(envKey(model)) || Deno.env.get("MODEL_DEFAULT");
const auth = () => ({ Authorization: "Key " + Deno.env.get("FAL_KEY"), "Content-Type": "application/json" });
// Only ever call fal's own queue addresses (they come back from fal when a job starts).
const isFal = (u: unknown) => typeof u === "string" && /^https:\/\/queue\.fal\.run\//.test(u);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let paid: { id: string; cost: number } | null = null;
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Please sign in to make a film." }, 401);
    if (user.is_anonymous) return json({ error: "Create a free account to make films." }, 403);
    const b = await req.json();

    if (b.action === "start") {
      const model = String(b.model || "seedance-2");
      const endpoint = endpointFor(model, !!b.image);
      if (!endpoint) return json({ error: "That video model isn't set up yet." }, 400);
      const prompt = [b.prompt, b.style && `${b.style} look`, b.camera && b.camera !== "Auto" && `${b.camera} camera`]
        .filter(Boolean).join(". ").slice(0, 1500);
      if (!prompt && !b.image) return json({ error: "Write a prompt or add a photo." }, 400);
      let resolution = String(b.resolution || "720p");
      if (model.startsWith("seedance") && resolution === "1080p") resolution = "720p"; // Seedance on fal tops out at 720p
      const seconds = Math.min(Math.max(Number(b.duration) || 5, 4), 15);
      if (!(await underLimit(user.id, "video", false))) return json({ error: "You've hit today's film limit. Try again tomorrow." }, 429);
      const cost = videoCost(model, seconds, resolution);
      const balance = await charge(user.id, cost, `film ${model} ${seconds}s ${resolution}`);
      if (balance < 0) return json({ error: "Not enough credits.", needCredits: cost }, 402);
      paid = { id: user.id, cost };
      // Common inputs. Each model accepts a slightly different set. Check the model's page on fal.ai.
      const input: Record<string, unknown> = {
        prompt, aspect_ratio: b.ratio || "9:16", duration: String(seconds), resolution, generate_audio: !!b.soundtrack,
      };
      if (b.image) input.image_url = b.image;
      if (model.startsWith("seedance")) input.end_user_id = user.id;
      const r = await fetch("https://queue.fal.run/" + endpoint, { method: "POST", headers: auth(), body: JSON.stringify(input) });
      if (!r.ok) throw new Error("start " + r.status + " " + (await r.text()));
      const j = await r.json();
      if (!isFal(j.status_url) || !isFal(j.response_url)) throw new Error("fal did not return queue addresses");
      await logGen(user.id, "video", model, cost);
      paid = null; // the job is running; from here a failure is reported by status, not refunded automatically
      return json({ jobId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url, credits: balance });
    }

    if (b.action === "status") {
      if (!isFal(b.statusUrl) || !isFal(b.responseUrl)) return json({ error: "Unknown job." }, 400);
      const s = await fetch(b.statusUrl, { headers: auth() });
      if (!s.ok) throw new Error("status " + s.status);
      const st = await s.json();
      if (st.status !== "COMPLETED") return json({ status: "working", queue: st.queue_position ?? null });
      const res = await fetch(b.responseUrl, { headers: auth() });
      const out = await res.json();
      const url = out?.video?.url || out?.videos?.[0]?.url;
      return url ? json({ status: "done", videoUrl: url }) : json({ status: "failed", error: out?.detail ? String(out.detail) : "No video came back." });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error(e);
    if (paid) await refund(paid.id, paid.cost).catch(() => {});
    return json({ error: "The video service had a problem. Your credits were returned." }, 500);
  }
});
