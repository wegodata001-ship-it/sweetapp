/** ערוצי משלוח — in-app + email (Resend) לסוגים מוגדרים */
export type NotificationDeliveryChannel = "IN_APP" | "EMAIL" | "WHATSAPP" | "PUSH";

export const ACTIVE_CHANNELS: NotificationDeliveryChannel[] = ["IN_APP", "EMAIL"];
