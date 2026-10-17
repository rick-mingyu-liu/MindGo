import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { query } from '../db/connection';
import { groupedBetween, REPORT_CURRENCY, type ConvertedGroup } from './moneyFacts';
import { termOf, boundsOf, labelOf, addDays, daysBetween } from '../utils/terms';
import { toDay } from '../utils/dates';
import config = require('../config');
import type { SavingsGoalRow, TransactionRow } from '../types/db';
import { escapeHtml, appUrl, clip, button, bar, heading, paragraph, layout, textFooter, styles } from './emailLayout';

interface EmailConfig {
  user?: string | undefined;
  pass?: string | undefined;
  host?: string | undefined;
  port: number;
  from?: string | undefined;
}

// EMAIL_HOST set: that SMTP server (implicit TLS on 465, STARTTLS otherwise).
// Unset: Gmail, exactly as before.
export const transportOptions = (email: EmailConfig): SMTPTransport.Options => {
  const auth = { user: email.user, pass: email.pass };
  if (!email.host) return { service: 'gmail', auth };
  return { host: email.host, port: email.port, secure: email.port === 465, auth };
};

export const fromAddress = (email: EmailConfig): string => email.from ?? `"TermPocket" <${email.user}>`;

const transporter = nodemailer.createTransport(transportOptions(config.email));

const verificationMinutes = Math.round(config.emailVerification.tokenExpiry / 60000);

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `'2026-10-09'` -> `'Oct 9'`, or `'Oct 9, 2026'` with the year. From the string, never a Date. */
const shortDay = (day: string, withYear: boolean = false): string => {
  const [year, month, date] = day.split('-');
  return `${MONTHS[Number(month) - 1] ?? ''} ${Number(date)}${withYear ? `, ${year}` : ''}`;
};

/** `Oct 9 – 15`, `Sep 28 – Oct 4`: the week as the subject and greeting say it. */
const weekLabel = (start: string, last: string): string =>
  start.slice(0, 7) === last.slice(0, 7)
    ? `${shortDay(start)} – ${Number(last.slice(8, 10))}`
    : `${shortDay(start)} – ${shortDay(last)}`;

/**
 * Today's day where the user lives. Users have no timezone column, so it is
 * the scheduler's (America/Toronto): the report goes out Sunday 7 p.m. there,
 * when the host's UTC clock may already say Monday.
 */
const todayIn = (timeZone: string, now: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

/** The report's week: the seven days ending today, half-open like every other window. */
const reportWeek = (now: Date): { today: string; start: string; end: string; label: string } => {
  const today = todayIn(config.cron.timezone, now);
  const start = addDays(today, -6);
  return { today, start, end: addDays(today, 1), label: weekLabel(start, today) };
};

/**
 * The first weekly report of a month is the one whose "today" (Toronto) is on
 * days 1-7: a Sunday there is the month's first Sunday exactly once.
 */
const isFirstReportOfMonth = (today: string): boolean => Number(today.slice(8, 10)) <= 7;

/** The whole month before `today`'s: `[start, end)` day strings and its English name. Integer arithmetic, no Date. */
const previousMonthOf = (today: string): { start: string; end: string; name: string } => {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const key = (y: number, m: number): string => `${y}-${String(m).padStart(2, '0')}-01`;
  return { start: key(prevYear, prevMonth), end: key(year, month), name: MONTH_NAMES[prevMonth - 1] ?? '' };
};

export const weeklyReportSubject = (now: Date = new Date()): string => `Your TermPocket week: ${reportWeek(now).label}`;

export const sendWeeklyReport = async (to: string, content: string, htmlContent: string, subject: string = weeklyReportSubject()): Promise<void> => {
  await transporter.sendMail({
    from: fromAddress(config.email),
    to,
    subject,
    text: content,
    html: htmlContent,
  });
};

/** The verification email's parts, without sending: what sendEmailVerification mails. */
export const verificationEmail = (firstName: string, verificationToken: string): { subject: string; text: string; html: string } => {
  const verificationUrl = appUrl(`/verify-email?token=${encodeURIComponent(verificationToken)}`);
  const name = clip(firstName, 60);
  const greeting = name ? `Welcome to TermPocket, ${name}!` : 'Welcome to TermPocket!';
  const ignore = `This link expires in ${verificationMinutes} minutes. If you didn't create a TermPocket account, you can safely ignore this email.`;

  const body = [
    `<h1 style="margin:0 0 16px 0;font-family:${styles.FONT};font-size:22px;line-height:28px;font-weight:700;color:${styles.INK};">${escapeHtml(greeting)}</h1>`,
    paragraph('Confirm your email address to finish setting up your account and start tracking your money, term by term.'),
    button(verificationUrl, 'Verify email address'),
    paragraph('If the button doesn\'t work, copy and paste this link into your browser:', true),
    paragraph(`<a href="${escapeHtml(verificationUrl)}" style="color:#16a34a;word-break:break-all;">${escapeHtml(verificationUrl)}</a>`, true),
    paragraph(escapeHtml(ignore), true),
  ].join('\n');

  const text = [
    greeting,
    '',
    'Confirm your email address to finish setting up your account:',
    '',
    verificationUrl,
    '',
    ignore,
    '',
    textFooter(),
  ].join('\n');

  return {
    subject: 'Verify your TermPocket account',
    text,
    html: layout({ title: 'Verify your TermPocket account', preheader: 'Confirm your email address to finish signing up.', body }),
  };
};

export const sendEmailVerification = async (to: string, firstName: string, verificationToken: string): Promise<void> => {
  // Not the URL: it carries the token, and console.log prints in production.
  console.log(`[EmailService] Using verification URL base: ${appUrl('/verify-email')}`);
  const email = verificationEmail(firstName, verificationToken);
  await transporter.sendMail({
    from: fromAddress(config.email),
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
};

// ─── Weekly report ───────────────────────────────────────────────────────────

const moneyFormats = new Map<string, Intl.NumberFormat>();

/** `$1,234.56` for CAD; `US$12.00`, `CN¥88.00` for the others. */
const money = (amount: number, currency: string = REPORT_CURRENCY): string => {
  let format = moneyFormats.get(currency);
  if (!format) {
    try {
      format = new Intl.NumberFormat('en-CA', { style: 'currency', currency });
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
    moneyFormats.set(currency, format);
  }
  return format.format(amount);
};

interface Totals {
  income: number;
  spending: number;
  net: number;
  /** Spending per category, largest first. */
  categories: Array<{ category: string; amount: number }>;
}

/** Sums converted groups in integer cents, so ten 0.10s are exactly 1.00. */
const totalsOf = (groups: ConvertedGroup[]): Totals => {
  let income = 0;
  let spending = 0;
  const byCategory = new Map<string, number>();
  for (const g of groups) {
    const cents = Math.round(g.amount * 100);
    if (g.type === 'income') income += cents;
    else {
      spending += cents;
      byCategory.set(g.category, (byCategory.get(g.category) ?? 0) + cents);
    }
  }
  return {
    income: income / 100,
    spending: spending / 100,
    net: (income - spending) / 100,
    categories: [...byCategory].sort((a, b) => b[1] - a[1]).map(([category, cents]) => ({ category, amount: cents / 100 })),
  };
};

type RecentRow = Pick<TransactionRow, 'date' | 'type' | 'description' | 'category' | 'amount' | 'currency'>;
type GoalRow = Pick<SavingsGoalRow, 'name' | 'current_amount' | 'target_amount' | 'target_date' | 'currency'>;

interface GoalLine {
  name: string;
  saved: number;
  target: number;
  currency: string;
  /** Floored, so 99.6% never reads as 100; null when there is no target to measure against. */
  percent: number | null;
  status: string;
}

const MAX_CATEGORIES = 5;
const MAX_RECENT = 5;
const MAX_GOALS = 5;

const goalLine = (goal: GoalRow, today: string): GoalLine => {
  const target = Number(goal.target_amount);
  const saved = Number(goal.current_amount ?? 0);
  const percent = target > 0 ? Math.min(100, Math.floor((saved / target) * 100)) : null;
  const due = toDay(goal.target_date);
  let status: string;
  if (percent === null) status = 'No target amount set';
  else if (saved >= target) status = 'Reached';
  else if (!due) status = 'No target date';
  else if (due < today) status = `Overdue since ${shortDay(due, true)}`;
  else {
    const days = daysBetween(today, due);
    status = `Due ${shortDay(due, true)}${days <= 60 ? ` (${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`})` : ''}`;
  }
  return { name: clip(goal.name, 60), saved, target, currency: goal.currency || REPORT_CURRENCY, percent, status };
};

// One label/value row; `valueHtml` is already safe.
const row = (labelHtml: string, valueHtml: string, strong: boolean = false): string =>
  `<tr><td style="padding:6px 0;font-family:${styles.FONT};font-size:15px;line-height:22px;color:${styles.INK};">${labelHtml}</td>`
  + `<td align="right" style="padding:6px 0;font-family:${styles.FONT};font-size:15px;line-height:22px;color:${styles.INK};white-space:nowrap;${strong ? 'font-weight:700;' : ''}">${valueHtml}</td></tr>`;

const table = (rows: string): string =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table>`;

const muted = (html: string): string => `<span style="font-family:${styles.FONT};color:${styles.MUTED};font-size:13px;line-height:18px;">${html}</span>`;

const netColour = (net: number): string => (net < 0 ? '#dc2626' : '#16a34a');

const totalsTable = (t: Totals): string => table(
  row('Income', escapeHtml(money(t.income)))
  + row('Spending', escapeHtml(money(t.spending)))
  + `<tr><td colspan="2" style="border-top:1px solid ${styles.LINE};font-size:1px;line-height:1px;">&nbsp;</td></tr>`
  + row('<strong>Net</strong>', `<span style="color:${netColour(t.net)};">${escapeHtml(money(t.net))}</span>`, true)
);

const pad = (label: string, width: number = 12): string => label.padEnd(width, ' ');

const totalsText = (t: Totals): string[] => [
  `${pad('Income')}${money(t.income)}`,
  `${pad('Spending')}${money(t.spending)}`,
  `${pad('Net')}${money(t.net)}`,
];

const CONVERSION_LINE = 'All amounts in CAD. Other currencies are converted at current exchange rates.';
const WEEKLY_FOOTER_TEXT = 'You get this every Sunday because weekly reports are on. Turn them off in Settings.';
const weeklyFooterHtml = (): string =>
  `You get this every Sunday because weekly reports are on. <a href="${escapeHtml(appUrl('/settings'))}" style="color:${styles.MUTED};text-decoration:underline;">Turn them off in Settings</a>.`;

const greetingFor = (firstName: string): string => (firstName ? `Hi ${firstName},` : 'Hi there,');

/**
 * The Sunday email for one user, as `{ text, html }`. `now` is for tests and
 * previews; both callers (the scheduler and POST /auth/test-email) omit it.
 *
 * Totals are converted to CAD per currency through moneyFacts.groupedBetween,
 * like the dashboard and MCP. When a needed rate cannot be had it throws
 * (RateUnavailableError) rather than mail a total that adds yuan to dollars:
 * the scheduler logs that user's report as failed and moves on, and the test
 * endpoint answers 500. Any other failure throws the same way; this no longer
 * mails an "unable to generate" placeholder.
 */
export const generateWeeklyReport = async (userId: number, now: Date = new Date()): Promise<{ text: string; html: string }> => {
  const week = reportWeek(now);
  const userRes = await query<{ first_name: string }>('SELECT first_name FROM users WHERE id = $1', [userId]);
  const firstName = clip(userRes.rows[0]?.first_name, 60);
  const greeting = greetingFor(firstName);
  const dashboard = appUrl();

  const weekGroups = await groupedBetween(userId, week.start, week.end);

  if (weekGroups.length === 0) {
    const addUrl = appUrl('/transactions/new');
    const lines = [
      `Nothing recorded for ${week.label}.`,
      'Quiet weeks happen. If you did spend or earn something, add it now and next week\'s report will have the full picture.',
    ];
    const body = [
      paragraph(escapeHtml(greeting)),
      paragraph(`<strong>${escapeHtml(lines[0])}</strong>`),
      paragraph(escapeHtml(lines[1])),
      button(addUrl, 'Add a transaction'),
    ].join('\n');
    const text = [greeting, '', ...lines.flatMap((l) => [l, '']), `Add a transaction: ${addUrl}`, '', textFooter(WEEKLY_FOOTER_TEXT)].join('\n');
    return {
      text,
      html: layout({ title: `Your TermPocket week: ${week.label}`, preheader: `Nothing recorded for ${week.label}.`, body, footerNote: weeklyFooterHtml() }),
    };
  }

  const termId = termOf(week.today);
  const termLabel = labelOf(termId);
  const termGroups = await groupedBetween(userId, boundsOf(termId).start, week.end);

  const recentRes = await query<RecentRow>(
    `SELECT date, type, description, category, amount, currency
       FROM transactions
      WHERE user_id = $1 AND date >= $2 AND date < $3
      ORDER BY date DESC, id DESC
      LIMIT ${MAX_RECENT}`,
    [userId, week.start, week.end]
  );
  const goalsRes = await query<GoalRow>(
    `SELECT name, current_amount, target_amount, target_date, currency
       FROM savings_goals WHERE user_id = $1
      ORDER BY target_date NULLS LAST, id`,
    [userId]
  );

  const weekTotals = totalsOf(weekGroups);
  const termTotals = totalsOf(termGroups);
  const topCategories = weekTotals.categories.slice(0, MAX_CATEGORIES);
  const recent = recentRes.rows.map((t) => ({
    day: toDay(t.date) ?? '',
    income: t.type === 'income',
    description: clip(t.description, 48) || '(no description)',
    category: clip(t.category, 40),
    amount: money(Number(t.amount), t.currency || REPORT_CURRENCY),
  }));
  const goals = goalsRes.rows.map((g) => goalLine(g, week.today));
  // Last month's leftover, only in the month's first report and only if some goal could use it.
  let leftover: { amount: number; month: string } | null = null;
  if (isFirstReportOfMonth(week.today) && goalsRes.rows.some((g) => Number(g.target_amount) > 0 && Number(g.current_amount ?? 0) < Number(g.target_amount))) {
    const previous = previousMonthOf(week.today);
    const { net } = totalsOf(await groupedBetween(userId, previous.start, previous.end));
    if (net > 0) leftover = { amount: net, month: previous.name };
  }
  const shownGoals = goals.slice(0, MAX_GOALS);
  const moreGoals = goals.length - shownGoals.length;
  const pctOf = (amount: number): number => (weekTotals.spending > 0 ? Math.round((amount / weekTotals.spending) * 100) : 0);

  // --- HTML ---
  const sections: string[] = [
    paragraph(escapeHtml(greeting)),
    paragraph(`Here's your week in TermPocket, <strong style="white-space:nowrap;">${escapeHtml(week.label)}</strong>.`),
    heading('This week'),
    totalsTable(weekTotals),
    heading(`${termLabel} so far`),
    totalsTable(termTotals),
    paragraph(escapeHtml(CONVERSION_LINE), true),
  ];

  if (topCategories.length > 0) {
    sections.push(heading('Where your money went'));
    sections.push(table(topCategories.map((c) =>
      row(escapeHtml(clip(c.category, 40)), `${escapeHtml(money(c.amount))} ${muted(`${pctOf(c.amount)}%`)}`)
      + `<tr><td colspan="2" style="padding:0 0 8px 0;">${bar(pctOf(c.amount))}</td></tr>`
    ).join('')));
  }

  sections.push(heading('Recent transactions'));
  sections.push(table(recent.map((t) =>
    row(
      `${escapeHtml(t.description)}<br>${muted(`${escapeHtml(shortDay(t.day))} · ${escapeHtml(t.category)}`)}`,
      `<span style="color:${t.income ? '#16a34a' : styles.INK};">${t.income ? '+' : '−'}${escapeHtml(t.amount)}</span>`
    )
  ).join('')));

  if (shownGoals.length > 0) {
    sections.push(heading('Savings goals'));
    sections.push(table(shownGoals.map((g) =>
      // Amounts go on the status line, not beside the name, so a phone-width card never has to fit both.
      row(`<strong>${escapeHtml(g.name)}</strong>`, g.percent === null ? '' : `${g.percent}%`)
      + (g.percent === null ? '' : `<tr><td colspan="2" style="padding:2px 0 4px 0;">${bar(g.percent)}</td></tr>`)
      + `<tr><td colspan="2" style="padding:0 0 10px 0;">${muted(escapeHtml(`${money(g.saved, g.currency)} of ${money(g.target, g.currency)} · ${g.status}`))}</td></tr>`
    ).join('')));
    if (moreGoals > 0) sections.push(paragraph(escapeHtml(`And ${moreGoals} more in TermPocket.`), true));
  }

  const leftoverLine = leftover ? `You had ${money(leftover.amount)} left over in ${leftover.month}. Put some toward a goal?` : '';
  if (leftover) {
    sections.push(heading('Last month\'s leftover'));
    sections.push(paragraph(escapeHtml(leftoverLine)));
    sections.push(button(appUrl('/goals'), 'Add to a goal'));
  }

  sections.push(button(dashboard, 'Open your dashboard'));

  const html = layout({
    title: `Your TermPocket week: ${week.label}`,
    preheader: `This week: ${money(weekTotals.income)} in, ${money(weekTotals.spending)} out.`,
    body: sections.join('\n'),
    footerNote: weeklyFooterHtml(),
  });

  // --- Plain text ---
  const text: string[] = [
    greeting,
    '',
    `Here's your week in TermPocket, ${week.label}.`,
    '',
    'THIS WEEK',
    ...totalsText(weekTotals),
    '',
    `${termLabel.toUpperCase()} SO FAR`,
    ...totalsText(termTotals),
    '',
    CONVERSION_LINE,
  ];
  if (topCategories.length > 0) {
    text.push('', 'WHERE YOUR MONEY WENT');
    for (const c of topCategories) text.push(`${pad(clip(c.category, 22), 24)}${money(c.amount)} (${pctOf(c.amount)}%)`);
  }
  text.push('', 'RECENT TRANSACTIONS');
  for (const t of recent) text.push(`${pad(shortDay(t.day), 8)}${pad(`${t.income ? '+' : '-'}${t.amount}`, 14)}${t.description} (${t.category})`);
  if (shownGoals.length > 0) {
    text.push('', 'SAVINGS GOALS');
    for (const g of shownGoals) {
      text.push(`${g.name}: ${money(g.saved, g.currency)} of ${money(g.target, g.currency)}${g.percent === null ? '' : ` (${g.percent}%)`} - ${g.status}`);
    }
    if (moreGoals > 0) text.push(`And ${moreGoals} more in TermPocket.`);
  }
  if (leftover) text.push('', 'LAST MONTH\'S LEFTOVER', leftoverLine, `Add to a goal: ${appUrl('/goals')}`);
  text.push('', `Open your dashboard: ${dashboard}`, '', textFooter(WEEKLY_FOOTER_TEXT));

  return { text: text.join('\n'), html };
};
