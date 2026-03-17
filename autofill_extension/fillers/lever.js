// Lever uses React-rendered forms — stable class names but needs event simulation

window._fillLever = function(p) {
  const { fillInput, fillSelect, findByLabel, findByAttr } = window._jobFill;

  // Lever uses name attributes reliably
  fillInput(document.querySelector("[name='name']"),
    `${p.firstName} ${p.lastName}`);

  fillInput(document.querySelector("[name='email']"), p.email);
  fillInput(document.querySelector("[name='phone']"), p.phone);

  fillInput(document.querySelector("[name='org']")
    || findByLabel("current company"), "");  // leave blank or add to profile

  fillInput(document.querySelector("[name='urls[LinkedIn]']")
    || findByAttr([["placeholder","LinkedIn"]]), p.linkedin);

  fillInput(document.querySelector("[name='urls[GitHub]']")
    || findByAttr([["placeholder","GitHub"]]), p.github);

  fillInput(document.querySelector("[name='urls[Portfolio]']")
    || findByAttr([["placeholder","Portfolio"]]), p.portfolio);

  // Lever custom questions
  const cards = document.querySelectorAll(".application-question");
  for (const card of cards) {
    const text = card.querySelector("label, .question-label")
      ?.textContent?.toLowerCase() || "";
    const input = card.querySelector("input, textarea, select");
    if (!input) continue;

    if (text.includes("linkedin"))   fillInput(input, p.linkedin);
    if (text.includes("github"))     fillInput(input, p.github);
    if (text.includes("website") || text.includes("portfolio"))
      fillInput(input, p.portfolio);
    if (text.includes("city") || text.includes("location"))
      fillInput(input, `${p.city}, ${p.state}`);
    if (text.includes("sponsor")) {
      if (input.tagName === "SELECT") fillSelect(input, p.sponsorship === "yes" ? "yes" : "no");
    }
    if (text.includes("authorized")) {
      if (input.tagName === "SELECT") fillSelect(input, p.authorized === "yes" ? "yes" : "no");
    }
  }

  console.log("[JobFill] Lever fill complete");
};

