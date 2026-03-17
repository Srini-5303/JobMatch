const fields = [
  "firstName", "lastName", "email", "phone",
  "linkedin", "github", "portfolio",
  "city", "state", "country",
  "sponsorship", "authorized", "resumeText"
];

function setStatus(msg, color = "#94a3b8") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.style.color = color;
}

// Load saved profile into form on popup open
chrome.runtime.sendMessage({ type: "GET_PROFILE" }, ({ profile }) => {
  if (!profile) return;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el && profile[id] !== undefined) el.value = profile[id];
  });
});

// Save profile
document.getElementById("saveBtn").addEventListener("click", () => {
  const profile = {};
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) profile[id] = el.value.trim();
  });
  chrome.runtime.sendMessage({ type: "SAVE_PROFILE", profile }, () => {
    setStatus("✓ Profile saved", "#10b981");
    setTimeout(() => setStatus(""), 2000);
  });
});

// Trigger fill on active tab
document.getElementById("fillBtn").addEventListener("click", () => {
  setStatus("Filling form...", "#38bdf8");
  chrome.runtime.sendMessage({ type: "TRIGGER_FILL" }, () => {
    setTimeout(() => setStatus("Done! Review before submitting ✓", "#10b981"), 800);
  });
});
