// jl-portfolio: serves the static site and the "Ask Jon" assistant at /api/ask.
import Anthropic from "@anthropic-ai/sdk";
import { DurableObject } from "cloudflare:workers";
import { CONTACT_EMAIL, isSameOrigin, caseStudyLinks, demoReply, systemPrompt, validateAsk } from "./ask.js";

const MAX_BODY_BYTES = 16_000;
const DEFAULT_DAILY_CAP = 400;
const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // Adam, an ElevenLabs stock male voice
const SYSTEM = systemPrompt();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ask") return handleAsk(request, env);
    return env.ASSETS.fetch(request);
  },
};

/** One counter per UTC day: a hard ceiling on answers, whatever the traffic. */
export class DailyBudget extends DurableObject {
  async take(cap) {
    const used = (await this.ctx.storage.get("used")) ?? 0;
    if (used >= cap) return false;
    await this.ctx.storage.put("used", used + 1);
    return true;
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const sorry = (status, text) => json({ text, links: [], error: true }, status);

async function handleAsk(request, env) {
  // Local dev rewrites both the URL and the Origin header to the route host, so a
  // same-origin check holds everywhere; a fixed allowlist did not.
  if (request.method !== "POST") return sorry(405, "Use POST.");
  if (!isSameOrigin(request.headers.get("origin"), request.url)) return sorry(403, "Not allowed from this site.");

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return sorry(413, "That message is too long.");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return sorry(400, "That request wasn't readable.");
  }
  const ask = validateAsk(body);
  if (ask.error) return sorry(400, "That request wasn't readable.");

  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const { success } = await env.ASK_LIMIT.limit({ key: ip });
  if (!success) return sorry(429, "You're asking faster than I can answer. Give it a minute.");

  const question = ask.messages[ask.messages.length - 1].content;
  if (!env.ANTHROPIC_API_KEY) return json(demoReply(question));

  const day = new Date().toISOString().slice(0, 10);
  const budget = env.BUDGET.get(env.BUDGET.idFromName(day));
  const cap = Number(env.DAILY_CAP) || DEFAULT_DAILY_CAP;
  if (!(await budget.take(cap))) {
    return sorry(503, `I've answered all the questions I can for today. Email ${CONTACT_EMAIL} and the real Jon will reply.`);
  }

  let text;
  try {
    text = await answer(env, ask.messages);
  } catch (err) {
    console.error("anthropic", err?.status, err?.message);
    return sorry(502, `I couldn't answer just now. Try again, or email ${CONTACT_EMAIL}.`);
  }

  const reply = { text, links: caseStudyLinks(text) };
  if (ask.voice && env.ELEVENLABS_API_KEY) {
    try {
      Object.assign(reply, await speak(env, text));
    } catch (err) {
      // The page falls back to the browser's own voice.
      console.error("elevenlabs", err?.message);
    }
  }
  return json(reply);
}

async function answer(env, messages) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    model: env.MODEL || DEFAULT_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  });
  if (response.stop_reason === "refusal") {
    return `That's not something I can help with here. Ask me about Jon's work, or email ${CONTACT_EMAIL}.`;
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  if (!text) throw new Error(`empty answer, stop_reason ${response.stop_reason}`);
  return text;
}

/** Speech plus per-character timings, which drive the avatar's mouth. */
async function speak(env, text) {
  const voice = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const a = data.alignment;
  if (!data.audio_base64 || !a?.characters) throw new Error("no audio in response");
  return {
    audio: data.audio_base64,
    alignment: { chars: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds },
  };
}
