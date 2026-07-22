import "server-only";
import type { EmailProvider, EmailMessage, SendResult } from "../ports";

/** Resend — https://resend.com. Same port as SMS, different transport. */
export class ResendProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(messages: EmailMessage[]): Promise<SendResult[]> {
    const results: SendResult[] = [];

    for (const message of messages) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: this.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as {
          id?: string;
          message?: string;
        };

        results.push({
          to: message.to,
          ok: response.ok,
          providerRef: payload.id,
          cost: 0,
          error: response.ok ? undefined : (payload.message ?? `HTTP ${response.status}`),
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

/** Dry-run adapter — records as simulated rather than faking delivery. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(messages: EmailMessage[]): Promise<SendResult[]> {
    return messages.map((m) => ({
      to: m.to,
      ok: true,
      providerRef: `simulated-${m.reference ?? m.to}`,
      cost: 0,
    }));
  }
}

export function resolveEmailProvider(): {
  provider: EmailProvider;
  configured: boolean;
} {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "BEAMS <noreply@example.com>";

  if (apiKey) return { provider: new ResendProvider(apiKey, from), configured: true };
  return { provider: new ConsoleEmailProvider(), configured: false };
}
