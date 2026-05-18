import type { CheckNotifier } from "@/lib/checks/notifiers/types";

/**
 * מימוש זמני — לא שולח דבר. שמורות נקודות הרחבה לעתיד:
 *  - Resend (email): RESEND_API_KEY
 *  - WhatsApp Cloud API: WHATSAPP_TOKEN + WHATSAPP_PHONE_ID
 *  - SMS provider (Twilio/וכו'): SMS_PROVIDER + תלות API
 */

export const emailStubNotifier: CheckNotifier = {
  channel: "email",
  isReady() {
    return Boolean(process.env.RESEND_API_KEY);
  },
  async send() {
    // TODO: integrate with Resend API:
    // await fetch("https://api.resend.com/emails", { ... })
    return false;
  },
};

export const whatsappStubNotifier: CheckNotifier = {
  channel: "whatsapp",
  isReady() {
    return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  },
  async send() {
    // TODO: integrate with WhatsApp Cloud API
    return false;
  },
};

export const smsStubNotifier: CheckNotifier = {
  channel: "sms",
  isReady() {
    return Boolean(process.env.SMS_PROVIDER);
  },
  async send() {
    // TODO: integrate with SMS provider
    return false;
  },
};
