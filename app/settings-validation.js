export function settingsInput(data) {
  const field = (name, fallback = "") =>
    String(data.get(name) || fallback).trim();
  const valid = (name, choices, fallback) => {
    const value = field(name, fallback);
    if (!choices.includes(value)) throw new Error(`Choose a valid ${name}.`);
    return value;
  };
  const accentColor = field("accentColor", "#D95D39");
  if (!/^#[0-9a-f]{6}$/i.test(accentColor))
    throw new Error("Use a six-digit hex color, such as #D95D39.");
  return {
    accentColor,
    starStyle: valid("starStyle", ["solid", "outline"], "solid"),
    alignment: valid("alignment", ["left", "center"], "center"),
    // Normalize legacy settings; storefront collection never depends on login.
    customerEligibility: "everyone",
    autoPublishThreshold: valid(
      "autoPublishThreshold",
      ["disabled", "5stars", "4plus", "all"],
      "disabled",
    ),
    reviewDiscountPercent: valid(
      "reviewDiscountPercent",
      ["none", "10", "20"],
      "none",
    ),
    reviewFormOn: field("reviewFormOn") === "true",
    recycleBinOn: true,
  };
}
