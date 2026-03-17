// Greenhouse forms are plain HTML — most reliable ATS to fill
// Covers both boards.greenhouse.io and job-boards.greenhouse.io

window._fillGreenhouse = function(p) {
  const { fillInput, fillSelect, findByLabel, findByAttr } = window._jobFill;

  const first = document.getElementById("first_name")
    || findByAttr([["name","first_name"],["placeholder","First"]]);
  fillInput(first, p.firstName);

  const last = document.getElementById("last_name")
    || findByAttr([["name","last_name"],["placeholder","Last"]]);
  fillInput(last, p.lastName);

  const email = document.getElementById("email")
    || findByAttr([["name","email"],["type","email"]]);
  fillInput(email, p.email);

  const phone = document.getElementById("phone")
    || findByAttr([["name","phone"],["placeholder","Phone"]]);
  fillInput(phone, p.phone);

  // Location
  const loc = document.getElementById("job_application_location")
    || findByLabel("location")
    || findByAttr([["placeholder","City, State"]]);
  fillInput(loc, `${p.city}, ${p.state}`);

  // LinkedIn, GitHub, Portfolio — Greenhouse uses question fields
  const inputs = document.querySelectorAll("input[type='text'], input[type='url']");
  for (const input of inputs) {
    const label = input.closest(".field")?.querySelector("label")?.textContent?.toLowerCase()
      || input.getAttribute("aria-label")?.toLowerCase()
      || input.placeholder?.toLowerCase()
      || "";

    if (label.includes("linkedin"))  fillInput(input, p.linkedin);
    if (label.includes("github"))    fillInput(input, p.github);
    if (label.includes("portfolio") || label.includes("website") || label.includes("personal url"))
      fillInput(input, p.portfolio);
  }

  // Textareas: cover letter, additional info
  const textareas = document.querySelectorAll("textarea");
  for (const ta of textareas) {
    const label = ta.closest(".field")?.querySelector("label")?.textContent?.toLowerCase() || "";
    if (label.includes("cover letter") || label.includes("additional")) {
      // Only fill if empty
      if (!ta.value) fillInput(ta, `Please see my attached resume for details.`);
    }
  }

  // Work authorization dropdowns (Greenhouse uses <select> for these)
  const selects = document.querySelectorAll("select");
  for (const sel of selects) {
    const label = sel.closest(".field")?.querySelector("label")?.textContent?.toLowerCase()
      || sel.getAttribute("aria-label")?.toLowerCase() || "";

    if (label.includes("authorized") || label.includes("legally")) {
      fillSelect(sel, p.authorized === "yes" ? "yes" : "no");
    }
    if (label.includes("sponsorship") || label.includes("visa")) {
      fillSelect(sel, p.sponsorship === "yes" ? "yes" : "no");
    }
    if (label.includes("country")) {
      fillSelect(sel, p.country);
    }
  }

  console.log("[JobFill] Greenhouse fill complete");
};
