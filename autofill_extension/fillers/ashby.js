// Ashby uses React — inputs have data-testid or aria-label

window._fillAshby = function(p) {
  const { fillInput, fillSelect, findByLabel, findByAttr } = window._jobFill;

  fillInput(
    findByAttr([["data-testid","firstName-input"],["aria-label","First name"],["placeholder","First name"]]),
    p.firstName
  );
  fillInput(
    findByAttr([["data-testid","lastName-input"],["aria-label","Last name"],["placeholder","Last name"]]),
    p.lastName
  );
  fillInput(
    findByAttr([["data-testid","email-input"],["type","email"],["aria-label","Email"]]),
    p.email
  );
  fillInput(
    findByAttr([["data-testid","phone-input"],["aria-label","Phone"],["placeholder","Phone"]]),
    p.phone
  );

  // Ashby renders all custom questions as a list of labeled sections
  const sections = document.querySelectorAll("[data-testid='application-question'], .ashby-application-form-question");
  for (const section of sections) {
    const label = section.querySelector("label, p, span")?.textContent?.toLowerCase() || "";
    const input = section.querySelector("input, textarea, select");
    if (!input) continue;

    if (label.includes("linkedin"))  fillInput(input, p.linkedin);
    if (label.includes("github"))    fillInput(input, p.github);
    if (label.includes("portfolio") || label.includes("website"))
      fillInput(input, p.portfolio);
    if (label.includes("city") || label.includes("location"))
      fillInput(input, `${p.city}, ${p.state}`);
    if (label.includes("country"))
      input.tagName === "SELECT" ? fillSelect(input, p.country) : fillInput(input, p.country);
    if (label.includes("sponsor")) {
      if (input.tagName === "SELECT") fillSelect(input, p.sponsorship === "yes" ? "yes" : "no");
      else fillInput(input, p.sponsorship === "yes" ? "Yes" : "No");
    }
    if (label.includes("authorized")) {
      if (input.tagName === "SELECT") fillSelect(input, p.authorized === "yes" ? "yes" : "no");
      else fillInput(input, p.authorized === "yes" ? "Yes" : "No");
    }
  }

  console.log("[JobFill] Ashby fill complete");
};