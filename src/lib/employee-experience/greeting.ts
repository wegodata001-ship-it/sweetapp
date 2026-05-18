export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

/** מקטע יום לפי שעה מקומית — לברכות דינמיות */
export function getDayPeriod(date: Date = new Date()): DayPeriod {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

export const GREETING_I18N_KEY: Record<DayPeriod, string> = {
  morning: "employee.experience.greetingMorning",
  afternoon: "employee.experience.greetingAfternoon",
  evening: "employee.experience.greetingEvening",
  night: "employee.experience.greetingNight",
};
