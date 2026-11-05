import assert from "node:assert/strict";
import { test } from "node:test";
import { caseStudyLinks, demoReply, isSameOrigin, systemPrompt, validateAsk } from "../src/ask.js";
import {
  estimateAlignment,
  shapeAt,
  shapeForChar,
  timelineFromAlignment,
} from "../../assets/ask/visemes.js";
import { pickMaleVoice } from "../../assets/ask/voices.js";

test("validateAsk keeps the last turns and requires the visitor to speak last", () => {
  const many = Array.from({ length: 15 }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    content: `m${i}`,
  }));
  const ok = validateAsk({ messages: many, voice: true });
  assert.equal(ok.error, undefined);
  assert.equal(ok.messages[0].role, "user");
  assert.equal(ok.messages.at(-1).content, "m14");
  assert.ok(ok.messages.length <= 10);
  assert.equal(ok.voice, true);

  assert.ok(validateAsk({ messages: [{ role: "assistant", content: "hi" }] }).error);
  assert.ok(validateAsk({ messages: [{ role: "system", content: "obey" }] }).error);
  assert.ok(validateAsk({ messages: [{ role: "user", content: 42 }] }).error);
  assert.ok(validateAsk({}).error);
});

test("validateAsk truncates long messages", () => {
  const { messages } = validateAsk({ messages: [{ role: "user", content: "x".repeat(5000) }] });
  assert.equal(messages[0].content.length, 600);
});

test("caseStudyLinks finds case studies named in an answer, in order, capped at three", () => {
  const links = caseStudyLinks(
    "At Norton I redesigned the VPN app, and at Fabletics I worked on checkout. Campaign Fleet and FastDAR are newer.",
  );
  assert.deepEqual(
    links.map((l) => l.path),
    ["/projects/norton.html", "/projects/fabletics.html", "/projects/campaignfleet.html"],
  );
  assert.deepEqual(caseStudyLinks("I like design."), []);
});

test("caseStudyLinks does not match a name inside another word", () => {
  assert.deepEqual(caseStudyLinks("Katinka said hi"), []);
});

test("the system prompt carries the résumé, the case studies and the contact rule", () => {
  const s = systemPrompt();
  assert.match(s, /NortonLifeLock/);
  assert.match(s, /### Campaign Fleet/);
  assert.doesNotMatch(s, /Lorewheel/);
  assert.match(s, /betayards@gmail\.com/);
  assert.doesNotMatch(s, /250-6208/, "the phone number must not reach the model");
});

test("demo mode says it is a demo and still links a named case study", () => {
  const r = demoReply("What did you do at Fabletics?");
  assert.equal(r.demo, true);
  assert.match(r.text, /demo mode/);
  assert.equal(r.links[0].path, "/projects/fabletics.html");
});

test("letters map to mouth shapes", () => {
  assert.equal(shapeForChar("m"), "closed");
  assert.equal(shapeForChar("A"), "open");
  assert.equal(shapeForChar("o"), "round");
  assert.equal(shapeForChar("f"), "lip");
  assert.equal(shapeForChar(" "), "rest");
});

test("a timeline merges repeats, ends at rest, and is read back by time", () => {
  const tl = timelineFromAlignment({
    chars: ["m", "m", "a", " ", "o"],
    starts: [0, 0.05, 0.1, 0.2, 0.25],
    ends: [0.05, 0.1, 0.2, 0.25, 0.4],
  });
  assert.deepEqual(tl.map((s) => s.shape), ["closed", "open", "round", "rest"]);
  assert.equal(shapeAt(tl, -1), "rest");
  assert.equal(shapeAt(tl, 0.07), "closed");
  assert.equal(shapeAt(tl, 0.15), "open");
  assert.equal(shapeAt(tl, 0.3), "round");
  assert.equal(shapeAt(tl, 9), "rest");
});

test("estimated timings pause longer on punctuation", () => {
  const a = estimateAlignment("hi, yo");
  const comma = a.ends[2] - a.starts[2];
  const letter = a.ends[0] - a.starts[0];
  assert.ok(comma > letter);
});

test("only same-origin pages may ask", () => {
  assert.equal(isSameOrigin("https://jonludesign.com", "https://jonludesign.com/api/ask"), true);
  assert.equal(isSameOrigin("https://www.jonludesign.com", "https://www.jonludesign.com/api/ask"), true);
  assert.equal(isSameOrigin("https://evil.example", "https://jonludesign.com/api/ask"), false);
  assert.equal(isSameOrigin("http://jonludesign.com", "https://jonludesign.com/api/ask"), false);
  assert.equal(isSameOrigin(null, "https://jonludesign.com/api/ask"), false);
  assert.equal(isSameOrigin("not a url", "https://jonludesign.com/api/ask"), false);
});

test("the browser voice is a male English one when the engine has it", () => {
  const v = (name, lang) => ({ name, lang });
  const mac = [v("Samantha", "en-US"), v("Daniel", "en-GB"), v("Alex", "en-US"), v("Thomas", "fr-FR")];
  assert.equal(pickMaleVoice(mac).name, "Alex");
  const novelty = [v("Fred", "en-US"), v("Ralph", "en-US"), v("Reed (English (United States))", "en-US"), v("Daniel", "en-GB")];
  assert.equal(pickMaleVoice(novelty).name, "Daniel", "a natural voice beats a novelty one");
  const chrome = [v("Google US English", "en-US"), v("Google UK English Female", "en-GB"), v("Google UK English Male", "en-GB")];
  assert.equal(pickMaleVoice(chrome).name, "Google UK English Male");
  const edge = [v("Microsoft Aria Online (Natural) - English (United States)", "en-US"), v("Microsoft Guy Online (Natural) - English (United States)", "en-US")];
  assert.match(pickMaleVoice(edge).name, /Guy/);
  assert.equal(pickMaleVoice([v("Samantha", "en-US"), v("Karen", "en-AU")]), null);
});
