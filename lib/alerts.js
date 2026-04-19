/**
 * Alert module — Red Alerts, warnings, and COO daily digest email.
 * Uses Resend + Supabase alert_log. Supports ALERT_DRY_RUN=true.
 */
import 'dotenv/config.js';
import { Resend } from 'resend';
import { supabase } from './supabase.js';
import { withRetry } from './retry.js';

const LEVEL_META = {
  info: { emoji: '', color: '#2563eb', label: 'INFO' },
  warn: { emoji: 'WARN: ', color: '#d97706', label: 'WARN' },
  red:  { emoji: '\u{1F6A8} ', color: '#dc2626', label: 'RED ALERT' },
};

const DRY_RUN = String(process.env.ALERT_DRY_RUN ?? '').toLowerCase() === 'true';
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function getRecipients() {
  return (process.env.ALERT_EMAILS ?? '')
    .split(',').map(e => e.trim()).filter(Boolean);
}

function renderHtml({ level, title, body, metadata }) {
  const meta = LEVEL_META[level] ?? LEVEL_META.info;
  const metaRows = metadata && typeof metadata === 'object'
    ? Object.entries(metadata).map(([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:12px;">${k}</td><td style="padding:4px 0;font-family:monospace;font-size:12px;">${typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>`
      ).join('')
    : '';
  return `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px;">
    <div style="border-left:4px solid ${meta.color};padding:12px 16px;background:#f9fafb;">
      <div style="color:${meta.color};font-weight:700;font-size:12px;letter-spacing:.08em;">${meta.label}</div>
      <h1 style="margin:4px 0 0;font-size:20px;color:#111827;">${title}</h1>
    </div>
    <div style="padding:16px 0;color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${body}</div>
    ${metaRows ? `<table style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px;width:100%;">${metaRows}</table>` : ''}
    <div style="margin-top:24px;color:#9ca3af;font-size:11px;">BlondeShell Automation Alerts</div>
  </div>`;
}

async function persistLog({ level, title, body, metadata, emailIds }) {
  try {
    await supabase.from('alert_log').insert({
      level, title, body, metadata: metadata ?? {}, email_ids: emailIds ?? [],
    });
  } catch (err) {
    console.error(`[alerts] alert_log insert failed (ignored): ${err.message}`);
  }
}

async function sendAlert({ level = 'info', title, body, metadata }) {
  if (!title) throw new Error('sendAlert: title required');
  const meta = LEVEL_META[level] ?? LEVEL_META.info;
  const subject = `${meta.emoji}${title}`;
  const recipients = getRecipients();

  if (DRY_RUN || !resendClient || !recipients.length) {
    const reason = DRY_RUN ? 'DRY_RUN' : !resendClient ? 'NO_RESEND_KEY' : 'NO_RECIPIENTS';
    console.log(`[alerts:${reason}] ${meta.label} | ${subject}\n${body}\n${metadata ? JSON.stringify(metadata, null, 2) : ''}`);
    await persistLog({ level, title, body, metadata, emailIds: [] });
    return { dryRun: true, reason, emailIds: [] };
  }

  const send = async () => {
    const { data, error } = await resendClient.emails.send({
      from: process.env.RESEND_FROM ?? 'alerts@blondeshell.ai',
      to: recipients,
      subject,
      html: renderHtml({ level, title, body, metadata }),
      text: `${meta.label}: ${title}\n\n${body}\n\n${metadata ? JSON.stringify(metadata, null, 2) : ''}`,
    });
    if (error) throw new Error(error.message ?? JSON.stringify(error));
    return data?.id ? [data.id] : [];
  };

  try {
    const emailIds = await withRetry(send, { maxRetries: 2, baseDelayMs: 1000, label: `alert:${level}` });
    await persistLog({ level, title, body, metadata, emailIds });
    return { dryRun: false, emailIds };
  } catch (err) {
    console.error(`[alerts] send failed after retries: ${err.message}`);
    await persistLog({ level, title, body, metadata: { ...(metadata ?? {}), send_error: err.message }, emailIds: [] });
    throw err;
  }
}

async function sendRedAlert(title, body, metadata) {
  return sendAlert({ level: 'red', title, body, metadata });
}

function renderDigestHtml({ summary, metrics, issues }) {
  const metricsRows = Object.entries(metrics ?? {}).map(([k, v]) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${k}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px;text-align:right;">${typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>`
  ).join('');
  const issuesRows = (issues ?? []).map(i =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;color:${LEVEL_META[i.level]?.color ?? '#374151'};font-weight:600;font-size:12px;">${(i.level ?? 'info').toUpperCase()}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${i.message}</td></tr>`
  ).join('');
  return `<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;">
    <h1 style="font-size:22px;color:#111827;margin:0 0 8px;">BlondeShell Daily Digest</h1>
    <div style="color:#6b7280;font-size:13px;margin-bottom:16px;">${new Date().toISOString().slice(0,10)}</div>
    <div style="padding:12px 16px;background:#f9fafb;border-radius:6px;white-space:pre-wrap;color:#374151;font-size:14px;line-height:1.6;">${summary ?? ''}</div>
    ${metricsRows ? `<h2 style="font-size:14px;color:#111827;margin:20px 0 8px;">Metrics</h2><table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;">${metricsRows}</table>` : ''}
    ${issuesRows ? `<h2 style="font-size:14px;color:#111827;margin:20px 0 8px;">Issues</h2><table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;">${issuesRows}</table>` : ''}
    <div style="margin-top:24px;color:#9ca3af;font-size:11px;">BlondeShell COO Digest</div>
  </div>`;
}

async function sendDailyDigest({ to, summary, metrics, issues }) {
  const recipients = Array.isArray(to) ? to : to ? [to] : getRecipients();
  const subject = `BlondeShell Daily Digest — ${new Date().toISOString().slice(0,10)}`;

  if (DRY_RUN || !resendClient || !recipients.length) {
    const reason = DRY_RUN ? 'DRY_RUN' : !resendClient ? 'NO_RESEND_KEY' : 'NO_RECIPIENTS';
    console.log(`[alerts:${reason}] ${subject}\n${summary}\nMetrics: ${JSON.stringify(metrics)}\nIssues: ${JSON.stringify(issues)}`);
    return { dryRun: true, reason, emailIds: [] };
  }

  const send = async () => {
    const { data, error } = await resendClient.emails.send({
      from: process.env.RESEND_FROM ?? 'alerts@blondeshell.ai',
      to: recipients,
      subject,
      html: renderDigestHtml({ summary, metrics, issues }),
      text: `${subject}\n\n${summary}\n\nMetrics:\n${JSON.stringify(metrics, null, 2)}\n\nIssues:\n${(issues ?? []).map(i => `- [${i.level}] ${i.message}`).join('\n')}`,
    });
    if (error) throw new Error(error.message ?? JSON.stringify(error));
    return data?.id ? [data.id] : [];
  };

  const emailIds = await withRetry(send, { maxRetries: 2, baseDelayMs: 1000, label: 'daily_digest' });
  return { dryRun: false, emailIds };
}

export { sendAlert, sendRedAlert, sendDailyDigest };
