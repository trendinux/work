// "Ask AI Jon": an illustrated avatar that answers questions about the portfolio.
// Answers come from /api/ask (the jl-portfolio Worker); speech comes back with
// per-character timings, and the mouth follows them.
import { SHAPES, estimateAlignment, shapeAt, timelineFromAlignment } from "./visemes.js";
import { pickMaleVoice } from "./voices.js";

const EMAIL = "betayards@gmail.com";
const VOICE_KEY = "askjon.voice";
const MAX_HISTORY = 10;
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const SUGGESTIONS = [
  "What did you do at Norton?",
  "Show me your AI product work",
  "How do you work with engineers?",
  "Are you open to contract roles?",
];
const GREETING =
  "Hi, I'm an AI version of Jon. Ask me about my case studies, how I work, or what I'm looking for next.";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const readVoicePref = () => {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
};
const writeVoicePref = (on) => {
  try {
    localStorage.setItem(VOICE_KEY, on ? "on" : "off");
  } catch {
    /* private mode: the toggle still works for this visit */
  }
};

/* ---------- the face ---------- */

const faceSvg = (id) => `
<svg viewBox="24 26 152 152" aria-hidden="true" focusable="false">
  <defs><clipPath id="${id}"><path class="aj-mouth-shape"/></clipPath></defs>
  <path class="aj-body" d="M30 200c4-36 32-56 70-56s66 20 70 56z"/>
  <path class="aj-collar" d="M78 146l22 22 22-22c-6-3-14-5-22-5s-16 2-22 5z"/>
  <rect class="aj-neck" x="88" y="126" width="24" height="26" rx="10"/>
  <g class="aj-head">
    <ellipse class="aj-ear" cx="56" cy="96" rx="8" ry="11"/>
    <ellipse class="aj-ear" cx="144" cy="96" rx="8" ry="11"/>
    <ellipse class="aj-skin" cx="100" cy="92" rx="44" ry="50"/>
    <path class="aj-hair" d="M56 86c-4-32 18-50 46-50 26 0 46 16 43 46-8-12-22-20-40-21-12 9-30 16-49 25z"/>
    <g class="aj-brows">
      <path d="M72 76q9-6 18-1"/><path d="M110 75q9-5 18 1"/>
    </g>
    <g class="aj-eyes">
      <ellipse class="aj-eye" cx="81" cy="92" rx="5" ry="6.2"/>
      <ellipse class="aj-eye" cx="119" cy="92" rx="5" ry="6.2"/>
      <circle class="aj-glint" cx="83" cy="89.5" r="1.6"/>
      <circle class="aj-glint" cx="121" cy="89.5" r="1.6"/>
    </g>
    <ellipse class="aj-cheek" cx="68" cy="110" rx="8" ry="4.5"/>
    <ellipse class="aj-cheek" cx="132" cy="110" rx="8" ry="4.5"/>
    <path class="aj-nose" d="M100 96q-5 11 1 13"/>
    <g class="aj-mouth">
      <path class="aj-mouth-shape aj-mouth-fill"/>
      <rect class="aj-teeth" x="80" y="0" width="40" height="0" clip-path="url(#${id})"/>
      <path class="aj-mouth-shape aj-lips"/>
    </g>
  </g>
</svg>`;

function mouthPath({ open, wide }) {
  const cx = 100;
  const cy = 121;
  const w = 8 + wide * 11;
  const h = 1.5 + open * 15;
  const up = 1.2 + h * 0.25;
  return (
    `M${cx - w} ${cy}` +
    `C${cx - w * 0.55} ${cy - up} ${cx + w * 0.55} ${cy - up} ${cx + w} ${cy}` +
    `C${cx + w * 0.7} ${cy + h} ${cx - w * 0.7} ${cy + h} ${cx - w} ${cy}Z`
  );
}

class Face {
  constructor(svg) {
    this.svg = svg;
    this.head = svg.querySelector(".aj-head");
    this.eyes = svg.querySelector(".aj-eyes");
    this.brows = svg.querySelector(".aj-brows");
    this.mouthShapes = svg.querySelectorAll(".aj-mouth-shape");
    this.teeth = svg.querySelector(".aj-teeth");
    this.mouth = { ...SHAPES.rest };
    this.target = "rest";
    this.look = { x: 0, y: 0 };
    this.lookTarget = { x: 0, y: 0 };
    this.browLift = 0;
    this.nextBlink = performance.now() + 2500;
    this.blinkUntil = 0;
    this.speech = null; // { timeline, clock: () => seconds }
    this.last = performance.now();
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const tick = (now) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
  }

  lookAt(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    const dx = (clientX - (r.left + r.width / 2)) / innerWidth;
    const dy = (clientY - (r.top + r.height * 0.45)) / innerHeight;
    this.lookTarget = { x: Math.max(-1, Math.min(1, dx * 3)), y: Math.max(-1, Math.min(1, dy * 3)) };
  }

  hello() {
    this.browLift = 1;
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const ease = (rate) => 1 - Math.exp(-dt * rate);

    if (this.speech) {
      const t = this.speech.clock();
      this.target = shapeAt(this.speech.timeline, t);
    }
    const goal = SHAPES[this.target] ?? SHAPES.rest;
    for (const k of ["open", "wide", "teeth"]) this.mouth[k] += (goal[k] - this.mouth[k]) * ease(28);

    const d = mouthPath(this.mouth);
    this.mouthShapes.forEach((p) => p.setAttribute("d", d));
    const teethH = this.mouth.teeth * this.mouth.open * 6;
    this.teeth.setAttribute("y", String(121 - teethH * 0.2));
    this.teeth.setAttribute("height", String(teethH));

    if (now > this.nextBlink) {
      this.blinkUntil = now + 130;
      this.nextBlink = now + 2600 + Math.random() * 3400;
    }
    const blink = now < this.blinkUntil ? 0.1 : 1;
    this.look.x += (this.lookTarget.x - this.look.x) * ease(8);
    this.look.y += (this.lookTarget.y - this.look.y) * ease(8);
    this.browLift += (0 - this.browLift) * ease(2.2);

    const ex = reducedMotion ? 0 : this.look.x * 3;
    const ey = reducedMotion ? 0 : this.look.y * 2;
    this.eyes.setAttribute("transform", `translate(${ex} ${ey}) translate(0 92) scale(1 ${blink}) translate(0 -92)`);
    this.brows.setAttribute("transform", `translate(0 ${-this.browLift * 4})`);

    if (!reducedMotion) {
      const talking = this.speech ? Math.sin(now / 170) * 0.8 : 0;
      const bob = Math.sin(now / 900) * 1.2;
      const tilt = this.look.x * 4 + talking;
      this.head.setAttribute("transform", `translate(0 ${bob}) rotate(${tilt} 100 130)`);
    }
  }
}

/* ---------- speech ---------- */

class Voice {
  constructor(face) {
    this.face = face;
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.unlocked = false;
  }

  /** Call inside a click or keypress, so later playback is allowed (Safari). */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.audio.src = SILENT_WAV;
    this.audio.play().catch(() => {});
    if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }

  stop() {
    this.audio.pause();
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.face.speech = null;
    this.face.target = "rest";
  }

  async say(text, reply) {
    this.stop();
    if (reply?.audio && reply.alignment) return this.playClip(reply);
    return this.speakWithBrowser(text);
  }

  playClip({ audio, alignment }) {
    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    const timeline = timelineFromAlignment(alignment);
    return new Promise((resolve) => {
      const done = () => {
        URL.revokeObjectURL(url);
        this.face.speech = null;
        this.face.target = "rest";
        resolve();
      };
      this.audio.onended = done;
      this.audio.onerror = done;
      this.audio.src = url;
      this.face.speech = { timeline, clock: () => this.audio.currentTime };
      this.audio.play().catch(done);
    });
  }

  speakWithBrowser(text) {
    if (!("speechSynthesis" in window)) return Promise.resolve();
    const alignment = estimateAlignment(text);
    const timeline = timelineFromAlignment(alignment);
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    const male = pickMaleVoice(speechSynthesis.getVoices());
    if (male) u.voice = male;
    else u.pitch = 0.8; // no male voice installed: lower whatever the default is
    let origin = performance.now();
    return new Promise((resolve) => {
      const done = () => {
        this.face.speech = null;
        this.face.target = "rest";
        resolve();
      };
      u.onstart = () => {
        origin = performance.now();
        this.face.speech = { timeline, clock: () => (performance.now() - origin) / 1000 };
      };
      // Word boundaries resync the estimate with what the engine is actually saying.
      u.onboundary = (e) => {
        const expected = alignment.starts[e.charIndex];
        if (expected !== undefined) origin = performance.now() - expected * 1000;
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }
}

/* ---------- the panel ---------- */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v; // only ever our own static markup
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function build() {
  const launcher = el("button", { class: "aj-launch", type: "button", "aria-expanded": "false", "aria-controls": "aj-panel" }, [
    el("span", { class: "aj-launch-face", html: faceSvg("aj-clip-launch") }),
    el("span", { class: "aj-launch-text" }, [el("b", { text: "Ask AI Jon" }), el("small", { text: "about my work" })]),
  ]);

  const stage = el("div", { class: "aj-stage", html: faceSvg("aj-clip-stage") });
  const voiceBtn = el("button", { class: "aj-icon aj-voice", type: "button", "aria-pressed": "true" });
  const closeBtn = el("button", { class: "aj-icon", type: "button", "aria-label": "Close" , html: "&times;" });
  const log = el("div", { class: "aj-log", role: "log", "aria-live": "polite" });
  const chips = el("div", { class: "aj-chips" });
  const input = el("input", {
    class: "aj-input",
    type: "text",
    name: "question",
    maxlength: "600",
    autocomplete: "off",
    placeholder: "Ask about a project, a skill, a role…",
    "aria-label": "Your question",
  });
  const micBtn = el("button", { class: "aj-icon aj-mic", type: "button", "aria-label": "Ask out loud", html: MIC_ICON });
  const sendBtn = el("button", { class: "aj-send", type: "submit", text: "Ask" });
  const form = el("form", { class: "aj-form" }, [input, ...(SpeechRecognition ? [micBtn] : []), sendBtn]);

  const panel = el("div", { id: "aj-panel", class: "aj-panel", role: "dialog", "aria-label": "Ask AI Jon", hidden: "" }, [
    el("header", { class: "aj-head-row" }, [
      el("div", {}, [el("p", { class: "aj-kicker", text: "AI JON" }), el("p", { class: "aj-sub", text: "Answers from my résumé and case studies" })]),
      el("div", { class: "aj-tools" }, [voiceBtn, closeBtn]),
    ]),
    stage,
    log,
    chips,
    form,
    el("p", {
      class: "aj-fine",
      text:
        `An AI, not me live, and it can be wrong. Your question goes to Anthropic to answer it, and to ElevenLabs for the voice; nothing is stored here.` +
        (SpeechRecognition ? " Asking out loud uses your browser's speech recognition." : "") +
        ` For anything that matters, email ${EMAIL}.`,
    }),
  ]);

  document.body.append(launcher, panel);
  return { launcher, panel, stage, voiceBtn, closeBtn, log, chips, form, input, micBtn, sendBtn };
}

const MIC_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const SPEAKER_ON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

function init() {
  const ui = build();
  const launchFace = new Face(ui.launcher.querySelector("svg"));
  const face = new Face(ui.stage.querySelector("svg"));
  const voice = new Voice(face);
  const history = [];
  let voiceOn = readVoicePref();
  let busy = false;
  let greeted = false;

  launchFace.start();
  if ("speechSynthesis" in window) speechSynthesis.getVoices();

  const renderVoice = () => {
    ui.voiceBtn.innerHTML = voiceOn ? SPEAKER_ON : SPEAKER_OFF;
    ui.voiceBtn.setAttribute("aria-pressed", String(voiceOn));
    ui.voiceBtn.setAttribute("aria-label", voiceOn ? "Voice on. Turn off" : "Voice off. Turn on");
  };
  renderVoice();

  const addMessage = (role, text, links = []) => {
    const bubble = el("div", { class: `aj-msg aj-${role}` }, [el("p", { text })]);
    const safe = links.filter((l) => typeof l.path === "string" && l.path.startsWith("/projects/"));
    if (safe.length) {
      bubble.append(
        el("div", { class: "aj-links" }, safe.map((l) => el("a", { href: l.path, text: `Open ${l.title}` }))),
      );
    }
    ui.log.append(bubble);
    ui.log.scrollTop = ui.log.scrollHeight;
    return bubble;
  };

  const renderChips = () => {
    ui.chips.replaceChildren(
      ...SUGGESTIONS.map((q) => {
        const b = el("button", { type: "button", class: "aj-chip", text: q });
        b.addEventListener("click", () => ask(q));
        return b;
      }),
    );
  };

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    voice.unlock();
    voice.stop();
    busy = true;
    ui.sendBtn.disabled = true;
    ui.chips.hidden = true;
    ui.input.value = "";
    addMessage("user", q);
    history.push({ role: "user", content: q });
    const thinking = addMessage("ai", "…");
    thinking.classList.add("aj-thinking");
    face.target = "small";

    let reply;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY), voice: voiceOn }),
      });
      reply = await res.json().catch(() => null);
      if (!reply?.text) throw new Error(`HTTP ${res.status}`);
    } catch {
      reply = { text: `I can't reach my answers right now. Email ${EMAIL} and the real Jon will reply.`, links: [], error: true };
    }

    thinking.remove();
    face.target = "rest";
    addMessage("ai", reply.text, reply.links);
    if (!reply.error) history.push({ role: "assistant", content: reply.text });
    else history.pop();
    busy = false;
    ui.sendBtn.disabled = false;
    if (voiceOn) await voice.say(reply.text, reply);
  }

  const open = () => {
    ui.panel.hidden = false;
    ui.launcher.setAttribute("aria-expanded", "true");
    ui.launcher.hidden = true;
    face.start();
    if (!greeted) {
      greeted = true;
      addMessage("ai", GREETING);
      renderChips();
      face.hello();
    }
    ui.input.focus();
  };
  const close = () => {
    voice.stop();
    face.stop();
    ui.panel.hidden = true;
    ui.launcher.hidden = false;
    ui.launcher.setAttribute("aria-expanded", "false");
    ui.launcher.focus();
  };

  ui.launcher.addEventListener("click", open);
  ui.closeBtn.addEventListener("click", close);
  ui.panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  ui.voiceBtn.addEventListener("click", () => {
    voiceOn = !voiceOn;
    writeVoicePref(voiceOn);
    if (!voiceOn) voice.stop();
    renderVoice();
  });
  ui.form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(ui.input.value);
  });

  if (SpeechRecognition) {
    let rec = null;
    ui.micBtn.addEventListener("click", () => {
      if (rec) {
        rec.stop();
        return;
      }
      voice.unlock();
      voice.stop();
      rec = new SpeechRecognition();
      rec.lang = "en-US";
      rec.interimResults = true;
      ui.micBtn.classList.add("is-on");
      rec.onresult = (e) => {
        const r = e.results[e.results.length - 1];
        ui.input.value = r[0].transcript;
        if (r.isFinal) ask(ui.input.value);
      };
      rec.onend = rec.onerror = () => {
        ui.micBtn.classList.remove("is-on");
        rec = null;
      };
      rec.start();
    });
  }

  if (!reducedMotion) {
    addEventListener(
      "pointermove",
      (e) => {
        launchFace.lookAt(e.clientX, e.clientY);
        face.lookAt(e.clientX, e.clientY);
      },
      { passive: true },
    );
  }
}

init();
