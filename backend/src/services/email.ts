import nodemailer from 'nodemailer'
import { config } from '../config.js'

function smtpConfigured(): boolean {
  return !!(config.smtp.host && config.smtp.user && config.smtp.pass)
}

function getTransport() {
  if (!smtpConfigured()) {
    throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS)')
  }
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  })
}

export async function sendPasswordResetEmail(input: {
  to: string
  name: string
  resetUrl: string
}): Promise<void> {
  const transport = getTransport()
  const displayName = input.name.trim() || 'there'

  await transport.sendMail({
    from: config.smtp.from,
    to: input.to,
    subject: 'Reset your Ewentcast password',
    text: [
      `Hi ${displayName},`,
      '',
      'We received a request to reset your Ewentcast password.',
      `Open this link to choose a new password (expires in ${config.resetTokenHours} hours):`,
      '',
      input.resetUrl,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>Hi ${escapeHtml(displayName)},</p>
      <p>We received a request to reset your <strong>Ewentcast</strong> password.</p>
      <p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a></p>
      <p style="color:#666;font-size:13px;">This link expires in ${config.resetTokenHours} hours.</p>
      <p style="color:#666;font-size:13px;">If you did not request this, you can ignore this email.</p>
    `,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function isEmailConfigured(): boolean {
  return smtpConfigured()
}
