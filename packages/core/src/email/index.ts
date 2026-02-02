import { Resend } from 'resend';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailOptions {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  messageId: string;
}

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('EMAIL_FROM environment variable is not set');
  }
  return from;
}

export function parseKindleEmails(): string[] {
  const emails = process.env.KINDLE_EMAIL_TO;
  if (!emails) {
    return [];
  }
  return emails
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const resend = getResendClient();
  const from = getEmailFrom();

  const attachments = options.attachments?.map((att) => ({
    filename: att.filename,
    content: att.content,
  }));

  const result = await resend.emails.send({
    from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments,
  });

  if (result.error) {
    throw new Error(`Failed to send email: ${result.error.message}`);
  }

  return {
    messageId: result.data?.id || 'unknown',
  };
}

export async function sendDigestToKindle(
  epubBuffer: Buffer,
  filename: string,
  articleCount: number,
  date: Date
): Promise<SendEmailResult> {
  const kindleEmails = parseKindleEmails();

  if (kindleEmails.length === 0) {
    throw new Error('No Kindle email addresses configured (KINDLE_EMAIL_TO)');
  }

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Denver',
  });

  const subject = `Kindle Digest - ${dateStr}`;
  const text = `Your daily digest with ${articleCount} articles is attached.`;

  return sendEmail({
    to: kindleEmails,
    subject,
    text,
    attachments: [
      {
        filename,
        content: epubBuffer,
      },
    ],
  });
}

// ============================================================================
// Tiered Digest Email (two EPUB attachments)
// ============================================================================

export interface DigestAttachments {
  summaryEpub: Buffer;
  summaryFilename: string;
  fullArticlesEpub: Buffer;
  fullArticlesFilename: string;
}

export interface DigestStats {
  critical: number;
  notable: number;
  related: number;
  fullArticles: number;
}

export async function sendTieredDigestToKindle(
  attachments: DigestAttachments,
  stats: DigestStats,
  date: Date
): Promise<SendEmailResult> {
  const kindleEmails = parseKindleEmails();

  if (kindleEmails.length === 0) {
    throw new Error('No Kindle email addresses configured (KINDLE_EMAIL_TO)');
  }

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Denver',
  });

  const subject = `Kindle Digest - ${dateStr}`;
  const text = `Your daily digest is attached.

Summary: ${stats.critical} critical, ${stats.notable} notable, ${stats.related} related items
Full Articles: ${stats.fullArticles} complete articles (critical tier only)

Tip: Read the Summary first for an overview, then dive into Full Articles for details.`;

  return sendEmail({
    to: kindleEmails,
    subject,
    text,
    attachments: [
      {
        filename: attachments.summaryFilename,
        content: attachments.summaryEpub,
      },
      {
        filename: attachments.fullArticlesFilename,
        content: attachments.fullArticlesEpub,
      },
    ],
  });
}
