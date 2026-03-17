// Detects which ATS we're on and delegates to the correct filler
// Each filler (greenhouse.js, lever.js, ashby.js) exposes a global fill fn

function detectATS() {
  const url = window.location.href;
  if (url.includes("greenhouse.io")) return "greenhouse";
  if (url.includes("lever.co"))      return "lever";
  if (url.includes("ashbyhq.com"))   return "ashby";
  if (url.includes("workday"))       return "workday";
  return null;
}

function highlightField(el) {
  el.style.outline = "2px solid #10b981";
  el.style.background = "#f0fdf4";
  setTimeout(() => {
    el.style.outline = "";
    el.style.background = "";
  }, 2500);
}

// Utility: fill an input and trigger React/Vue change events
function fillInput(el, value) {
  if (!el || value === undefined || value === "") return false;

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, "value"
  )?.set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, "value"
  )?.set;

  if (el.tagName === "TEXTAREA" && nativeTextareaSetter) {
    nativeTextareaSetter.call(el, value);
  } else if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  // Fire events so React/Vue/Angular pick up the change
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur",   { bubbles: true }));
  highlightField(el);
  return true;
}

// Utility: set a <select> value
function fillSelect(el, value) {
  if (!el || !value) return false;
  const lower = value.toLowerCase();
  for (const opt of el.options) {
    if (opt.text.toLowerCase().includes(lower) || opt.value.toLowerCase().includes(lower)) {
      el.value = opt.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      highlightField(el);
      return true;
    }
  }
  return false;
}

// Utility: find input by label text
function findByLabel(text) {
  const labels = document.querySelectorAll("label");
  for (const label of labels) {
    if (label.textContent.toLowerCase().includes(text.toLowerCase())) {
      const forId = label.getAttribute("for");
      if (forId) return document.getElementById(forId);
      // label wraps input
      const input = label.querySelector("input, textarea, select");
      if (input) return input;
      // next sibling
      const next = label.nextElementSibling;
      if (next && ["INPUT","TEXTAREA","SELECT"].includes(next.tagName)) return next;
    }
  }
  return null;
}

// Utility: find by placeholder or name or aria-label
function findByAttr(attrs) {
  for (const [attr, value] of attrs) {
    const el = document.querySelector(`[${attr}*="${value}" i]`);
    if (el) return el;
  }
  return null;
}

// ─── ADD this to the bottom of your existing FILL_FORM handler ────────────
// Goes inside the chrome.runtime.onMessage listener, after the ATS fill call
// e.g. after window._fillGreenhouse?.(profile)

await fillOpenEndedQuestions(profile);

// ─── ADD this entire function anywhere in content.js ──────────────────────

const OPEN_ENDED_SIGNALS = [
  "why do you want",
  "why are you interested",
  "why this company",
  "what excites you",
  "tell us about yourself",
  "tell us about you",
  "describe yourself",
  "what are your goals",
  "career goals",
  "where do you see yourself",
  "what motivates you",
  "what drives you",
  "why should we hire",
  "what makes you a good fit",
  "what are you looking for",
  "describe a time",
  "greatest strength",
  "greatest weakness",
  "proudest achievement",
  "what do you know about",
];

function isOpenEndedQuestion(labelText) {
  const lower = labelText.toLowerCase();
  return OPEN_ENDED_SIGNALS.some(signal => lower.includes(signal));
}

// Grab the job description text from the current Greenhouse page
function getCurrentJD() {
  const el = document.querySelector("#content, .job-description, #job-description, section");
  return el ? el.innerText.substring(0, 3000) : document.body.innerText.substring(0, 3000);
}

async function fillOpenEndedQuestions(profile) {
  // Collect all textareas that look open-ended and are empty
  const candidates = [];

  // Works for Greenhouse, Lever, Ashby — all use .field or .application-question wrappers
  const wrappers = document.querySelectorAll(
    ".field, .application-question, .ashby-application-form-question, [data-testid='application-question']"
  );

  for (const wrapper of wrappers) {
    const label = wrapper.querySelector("label, p, legend, span")?.innerText || "";
    const ta    = wrapper.querySelector("textarea");
    if (!ta || ta.value.trim()) continue;           // skip if already filled
    if (!isOpenEndedQuestion(label)) continue;       // skip if not open-ended
    candidates.push({ ta, label });
  }

  if (candidates.length === 0) return;

  const jd     = getCurrentJD();
  const resume = profile.resumeText || "";

  for (const { ta, label } of candidates) {
    try {
      const res = await fetch("http://localhost:8000/answer-question", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: label,
          jd,
          resume,
        }),
      });

      if (!res.ok) {
        console.warn("[JobFill] /answer-question returned", res.status);
        continue;
      }

      const { answer } = await res.json();
      if (answer) {
        window._jobFill.fillInput(ta, answer);
        console.log(`[JobFill] Answered: "${label.substring(0, 60)}..."`);
      }
    } catch (err) {
      console.warn("[JobFill] Failed to get answer for question:", label, err);
    }
  }
}

// Expose helpers to filler scripts via window
window._jobFill = { fillInput, fillSelect, findByLabel, findByAttr };

// Listen for fill trigger from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "FILL_FORM") return;

  chrome.runtime.sendMessage({ type: "GET_PROFILE" }, ({ profile }) => {
    if (!profile) {
      alert("No profile saved. Open the extension popup and save your profile first.");
      return;
    }

    const ats = detectATS();
    switch (ats) {
      case "greenhouse": window._fillGreenhouse?.(profile); break;
      case "lever":      window._fillLever?.(profile);      break;
      case "ashby":      window._fillAshby?.(profile);      break;
      default:
        alert("This ATS is not yet supported. Supported: Greenhouse, Lever, Ashby.");
    }
  });
});
