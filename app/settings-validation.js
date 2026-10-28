export function settingsInput(data, automaticApproved) {
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
  const supportEmail = field("supportEmail");
  if (
    supportEmail &&
    (supportEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail))
  )
    throw new Error("Enter a valid support email address.");
  const senderName = field("senderName");
  if (senderName.length > 100 || /[\r\n]/.test(senderName))
    throw new Error("Sender name must be at most 100 characters on one line.");
  const delay = Number(field("requestDelayDays", "7"));
  const reminder = Number(field("reminderDays", "7"));
  if (
    !Number.isInteger(delay) ||
    delay < 1 ||
    delay > 30 ||
    ![0, 3, 7, 14].includes(reminder)
  )
    throw new Error(
      "Choose a delay of 1–30 days and a valid reminder interval.",
    );
  return {
    accentColor,
    starStyle: valid("starStyle", ["solid", "outline"], "solid"),
    alignment: valid("alignment", ["left", "center"], "center"),
    customerEligibility: valid(
      "customerEligibility",
      ["everyone", "loggedIn", "verifiedBuyer"],
      "everyone",
    ),
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
    requestEmailOn: field("requestEmailOn") === "true",
    recycleBinOn: true,
    senderName: senderName || null,
    supportEmail: supportEmail || null,
    requestDelayDays: delay,
    reminderDays: reminder,
    automaticRequestsOn:
      automaticApproved && field("automaticRequestsOn") === "true",
  };
}
