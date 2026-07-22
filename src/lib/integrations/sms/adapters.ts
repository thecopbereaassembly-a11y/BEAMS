import "server-only";
import type { SmsProvider, SmsMessage, SendResult } from "../ports";
import { smsSegments } from "../ports";

/**
 * SMS adapters for the Ghanaian market (ADR-006). Each implements the same
 * port, so the campaign service never knows which vendor is in use.
 *
 * Prices are per-segment in GHS and are configurable — treat the defaults as
 * estimates for the pre-send figure, not billing truth.
 */

const ARKESEL_RATE = Number(process.env.ARKESEL_RATE_GHS ?? 0.035);
const HUBTEL_RATE = Number(process.env.HUBTEL_RATE_GHS ?? 0.04);

/** Arkesel — https://sms.arkesel.com (V2 REST API). */
export class ArkeselProvider implements SmsProvider {
  readonly name = "arkesel";

  constructor(
    private readonly apiKey: string,
    private readonly sender: string,
  ) {}

  estimateCost(messageCount: number, segmentsPerMessage: number): number {
    return messageCount * segmentsPerMessage * ARKESEL_RATE;
  }

  async send(messages: SmsMessage[]): Promise<SendResult[]> {
    const results: SendResult[] = [];

    // Arkesel accepts a recipients array per body; we group identical bodies.
    for (const message of messages) {
      try {
        const response = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
          method: "POST",
          headers: {
            "api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: this.sender,
            message: message.body,
            recipients: [message.to.replace(/^\+/, "")],
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          status?: string;
          data?: { id?: string }[];
          message?: string;
        };

        const ok = response.ok && payload.status === "success";
        results.push({
          to: message.to,
          ok,
          providerRef: payload.data?.[0]?.id,
          cost: ok ? this.estimateCost(1, smsSegments(message.body)) : 0,
          error: ok ? undefined : (payload.message ?? `HTTP ${response.status}`),
        });
      } catch (error) {
        results.push({
          to: message.to,
          ok: false,
          error: error instanceof Error ? error.message : "Network error",
        });
      }
    }

    return results;
  }
}

/** Hubtel — https://hubtel.com (Quick SMS API, basic auth). */
export class HubtelProvider implements SmsProvider {
  readonly name = "hubtel";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly sender: string,
  ) {}

  estimateCost(messageCount: number, segmentsPerMessage: number): number {
    return messageCount * segmentsPerMessage * HUBTEL_RATE;
  }

  async send(messages: SmsMessage[]): Promise<SendResult[]> {
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const results: SendResult[] = [];

    for (const message of messages) {
      try {
        const response = await fetch("https://smsc.hubtel.com/v1/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            From: this.sender,
            To: message.to,
            Content: message.body,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          MessageId?: string;
          Status?: number;
          Message?: string;
        };

        const ok = response.ok;
        results.push({
          to: message.to,
          ok,
          providerRef: payload.MessageId,
          cost: ok ? this.estimateCost(1, smsSegments(message.body)) : 0,
          error: ok ? undefined : (payload.Message ?? `HTTP ${response.status}`),
        });
      } catch (error) {
        results.push({
          to: message.to,
          ok: false,
          error: error instanceof Error ? error.message : "Network error",
        });
      }
    }

    return results;
  }
}

/**
 * Dry-run adapter used when no credentials are configured.
 *
 * It deliberately does NOT pretend to send: messages are recorded as
 * "simulated" so nobody mistakes a development run for real delivery to real
 * phone numbers.
 */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";

  estimateCost(messageCount: number, segmentsPerMessage: number): number {
    return messageCount * segmentsPerMessage * ARKESEL_RATE;
  }

  async send(messages: SmsMessage[]): Promise<SendResult[]> {
    return messages.map((m) => ({
      to: m.to,
      ok: true,
      providerRef: `simulated-${m.reference ?? m.to}`,
      cost: 0,
    }));
  }
}

/** Chooses an adapter from the environment. Falls back to the dry-run provider. */
export function resolveSmsProvider(): { provider: SmsProvider; configured: boolean } {
  const arkeselKey = process.env.ARKESEL_API_KEY;
  const sender = process.env.SMS_SENDER_ID ?? "BEAMS";

  if (arkeselKey) {
    return { provider: new ArkeselProvider(arkeselKey, sender), configured: true };
  }

  const hubtelId = process.env.HUBTEL_CLIENT_ID;
  const hubtelSecret = process.env.HUBTEL_CLIENT_SECRET;
  if (hubtelId && hubtelSecret) {
    return {
      provider: new HubtelProvider(hubtelId, hubtelSecret, sender),
      configured: true,
    };
  }

  return { provider: new ConsoleSmsProvider(), configured: false };
}
