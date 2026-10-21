// Shared checks for every AI function: who is calling, can they afford it, are they under the daily limit.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*", // set to https://mariahsai.github.io for launch
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Works with both the new secret key and the legacy service_role key.
const SERVICE = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, SERVICE, { auth: { persistSession: false } });

// The signed-in user (guests sign in anonymously), or null.
export async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token.split(".").length !== 3) return null;
  const { data, error } = await admin().auth.getUser(token);
  return error ? null : data.user;
}

// Daily limits per account. Guests can make exactly one song.
const LIMITS = { song: 30, lyrics: 60, video: 10 } as const;
export async function underLimit(userId: string, kind: keyof typeof LIMITS, guest: boolean) {
  const db = admin();
  if (guest) {
    if (kind !== "song" && kind !== "lyrics") return false;
    const { count } = await db.from("generation_log").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "song");
    return (count ?? 0) < 1;
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from("generation_log").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("kind", kind).gte("created_at", since);
  return (count ?? 0) < LIMITS[kind];
}

// Returns the new balance, or -1 if they can't afford it.
export async function charge(userId: string, amount: number, reason: string): Promise<number> {
  if (amount <= 0) return 0;
  const { data, error } = await admin().rpc("spend_credits", { p_user: userId, p_amount: amount, p_reason: reason });
  if (error) throw error;
  return data as number;
}
export async function logGen(userId: string, kind: string, model: string, cost: number) {
  await admin().from("generation_log").insert({ user_id: userId, kind, model, cost });
}

// Prices. Keep in sync with the app (SMODELS and MODELS in app.html).
const SONG_BASE: Record<string, number> = { "eleven-music": 20 };
const VIDEO_BASE: Record<string, number> = { "seedance-2": 40, "veo-3.1": 75, "veo-3.1-fast": 45, "kling-3": 50, "hailuo-2.3": 35, "wan-3": 20, "vidu-q3": 30, "pixverse-v6": 25, "grok-imagine": 40 };
export function songCost(model: string, seconds: number) {
  const base = SONG_BASE[model] ?? 20;
  return Math.max(5, Math.round(base * Math.max(1, seconds / 30) / 5) * 5);
}
export function videoCost(model: string, seconds: number, res: string) {
  const base = VIDEO_BASE[model] ?? 50;
  const mult = ({ "480p": 1, "720p": 1.5, "1080p": 2.5 } as Record<string, number>)[res] ?? 1.5;
  return Math.max(10, Math.round(base * (seconds / 5) * mult / 5) * 5);
}

// Gives credits back when a paid generation fails.
export async function refund(userId: string, amount: number, reason = "refund: generation failed") {
  if (amount > 0) await admin().rpc("spend_credits", { p_user: userId, p_amount: -amount, p_reason: reason });
}
