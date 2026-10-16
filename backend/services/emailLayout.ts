import config = require('../config');

/**
 * The frame every TermPocket email shares, and the pieces inside it.
 *
 * Email clients are not browsers: Outlook renders with Word, Gmail strips
 * <style> blocks in some views, and none of them may load a webfont or a
 * remote image without asking. So this is tables, inline styles, a system font
 * stack and one image: the app icon, a PNG (Gmail and Outlook drop SVG) from
 * config.frontendUrl, beside a text wordmark so a blocked image costs nothing.
 * The oldest HTML that still renders the same in Gmail, Outlook, Apple Mail
 * and on a phone.
 *
 * Anything a user typed (a name, a description, a category, a goal) goes
 * through escapeHtml() before it is placed in markup. Registration lets anyone
 * choose a name and an arbitrary recipient address, so an unescaped name is a
 * way to put someone else's link inside an email signed by TermPocket.
 */

export const BRAND_GREEN = '#16a34a';
export const TAGLINE = 'Your money, term by term.';

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const PAGE = '#f3f4f6';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe for both element content and a quoted attribute value. */
export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);

/** An absolute link into the app, from config.frontendUrl: `appUrl('/settings')`. */
export const appUrl = (path: string = ''): string => `${config.frontendUrl.replace(/\/+$/, '')}${path}`;

/** A user-typed string for one line of an email: control characters out, at most `max` characters. */
export const clip = (value: unknown, max: number): string => {
  const flat = String(value ?? '').replace(/\p{Cc}+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/** A link-styled button that survives Outlook: the colour sits on the cell, not only the anchor. */
export const button = (href: string, label: string): string => `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
  <tr>
    <td bgcolor="${BRAND_GREEN}" style="border-radius:8px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;

/** A horizontal bar, `percent` of it filled. Two cells rather than a nested div, for Outlook. */
export const bar = (percent: number): string => {
  const filled = Math.max(0, Math.min(100, Math.round(percent)));
  const cell = (width: number, colour: string): string =>
    `<td width="${width}%" bgcolor="${colour}" style="height:8px;font-size:1px;line-height:1px;">&nbsp;</td>`;
  const cells = filled === 0 ? cell(100, LINE)
    : filled === 100 ? cell(100, BRAND_GREEN)
      : cell(filled, BRAND_GREEN) + cell(100 - filled, LINE);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-radius:4px;"><tr>${cells}</tr></table>`;
};

/** A section heading inside the card. */
export const heading = (text: string): string =>
  `<h2 style="margin:28px 0 12px 0;font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:${INK};">${escapeHtml(text)}</h2>`;

/** A paragraph of already-safe HTML. Escape anything user-typed before passing it in. */
export const paragraph = (safeHtml: string, muted: boolean = false): string =>
  `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:${muted ? 14 : 16}px;line-height:${muted ? 20 : 24}px;color:${muted ? MUTED : INK};">${safeHtml}</p>`;

export const styles = { FONT, INK, MUTED, LINE };

interface LayoutOptions {
  /** The <title> and the inbox preview line; plain text, escaped here. */
  title: string;
  preheader: string;
  /** The card's content, already safe HTML. */
  body: string;
  /** One extra footer line of already-safe HTML, e.g. why this email was sent. */
  footerNote?: string;
}

const footerLink = (href: string, label: string): string =>
  `<a href="${escapeHtml(href)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(label)}</a>`;

/** The whole document: page background, wordmark, white card, footer links. */
export const layout = ({ title, preheader, body, footerNote }: LayoutOptions): string => {
  const support = config.email.supportAddress;
  const links = [
    footerLink(appUrl(), 'Open TermPocket'),
    footerLink(appUrl('/settings'), 'Settings'),
    footerLink(appUrl('/privacy'), 'Privacy'),
  ].join(' &nbsp;&middot;&nbsp; ');
  const small = `font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${PAGE}" style="background-color:${PAGE};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
        <tr>
          <td style="padding:8px 4px 20px 4px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:12px;"><img src="${escapeHtml(appUrl('/icon-192.png'))}" width="40" height="40" alt="TermPocket" style="display:block;border:0;"></td>
                <td valign="middle">
                  <div style="font-family:${FONT};font-size:24px;line-height:30px;font-weight:800;color:${BRAND_GREEN};">TermPocket</div>
                  <div style="font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(TAGLINE)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:28px 24px;">
${body}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 8px 4px;">
            ${footerNote ? `<p style="margin:0 0 12px 0;${small}">${footerNote}</p>` : ''}
            <p style="margin:0 0 8px 0;${small}">${links}</p>
            <p style="margin:0;${small}">Questions? <a href="mailto:${escapeHtml(support)}" style="color:${MUTED};text-decoration:underline;">${escapeHtml(support)}</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
};

/** The plain-text twin of the footer: the same links, written out. */
export const textFooter = (note?: string): string => {
  const lines = [
    '--',
    'TermPocket · ' + TAGLINE,
    ...(note ? [note] : []),
    `Open TermPocket: ${appUrl()}`,
    `Settings: ${appUrl('/settings')}`,
    `Privacy: ${appUrl('/privacy')}`,
    `Questions? ${config.email.supportAddress}`,
  ];
  return lines.join('\n');
};
