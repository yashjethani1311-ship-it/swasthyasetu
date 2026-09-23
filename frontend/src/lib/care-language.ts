import { useMemo } from "react";
import { useLanguage } from "./i18n";

const statuses: Record<string, [string, string]> = {
  OPEN: ["Pending", "बाकी है"],
  CLOSED: ["Closed", "पूरा हुआ"],
  REQUESTED: ["Requested", "अनुरोध भेजा गया"],
  PARTIAL: ["Partly dispensed", "कुछ दवाइयाँ मिलीं"],
  DISPENSED: ["Dispensed", "दवाइयाँ मिल गईं"],
  ASSIGNED: ["Assigned", "कार्यकर्ता तय हुआ"],
  CONTACTED: ["Contact recorded", "संपर्क किया गया"],
  VISITED: ["Visit recorded", "मुलाकात हुई"],
  ESCALATED: ["Doctor attention needed", "डॉक्टर को ध्यान देना है"],
  AWAITING_VERIFICATION: ["Doctor verification pending", "डॉक्टर को जाँचना है"],
  COMPLETED: ["Completed", "पूरा हुआ"],
  IN_PROGRESS: ["In progress", "चल रहा है"],
  ACTIVE: ["Active", "चालू"],
  HIGH: ["High priority", "जल्दी ध्यान दें"],
  CRITICAL: ["Urgent", "तुरंत ध्यान दें"],
  ROUTINE: ["Routine", "सामान्य"],
  NORMAL: ["Routine", "सामान्य"],
  MEDIUM: ["Medium priority", "ध्यान देना है"],
  LOW: ["Low priority", "सामान्य"],
};
export function workflowLabel(value: string, language: "English" | "Hindi") {
  return (
    statuses[value]?.[language === "Hindi" ? 1 : 0] ??
    value.replaceAll("_", " ")
  );
}
export function useCareLanguage() {
  const { language } = useLanguage();
  return useMemo(
    () => ({
      language,
      tr: (en: string, hi: string) => (language === "Hindi" ? hi : en),
      label: (value: string) => workflowLabel(value, language),
    }),
    [language]
  );
}
