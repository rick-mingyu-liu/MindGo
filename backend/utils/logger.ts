import config = require('../config');

class Logger {
  enabled: boolean;

  constructor() {
    this.enabled = config.logging.enableConsoleLogs;
  }

  info(message: string, data: unknown = null): void {
    if (this.enabled) {
      const timestamp = new Date().toISOString();
      console.log(`[INFO] ${timestamp} - ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  error(message: string, error: unknown = null): void {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] ${timestamp} - ${message}`);
    if (error) {
      console.error((error instanceof Error && error.stack) || error);
    }
  }

  /**
   * Always prints, in every environment — the point of it.
   *
   * `info`/`warn`/`debug` are gated on `enableConsoleLogs`, which is
   * `NODE_ENV === 'development'`, so anything routed through them is silent in
   * production. That is right for chatter and wrong for a record of user data
   * being destroyed: the retention jobs delete accounts and AI plans
   * unattended, and "how many did they remove last week" was unanswerable from
   * a production log. `error` already always prints, so a *failing* cleanup was
   * visible; a *successful* one was not.
   *
   * Reserve this for events that destroy or irreversibly change user data.
   * Everything that is merely useful belongs in `info` — an audit level that
   * fills up with routine chatter stops being one.
   *
   * The general fix — giving this class a real level hierarchy, since `level`
   * today gates only `debug()` — is still open.
   */
  audit(message: string, data: unknown = null): void {
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] ${timestamp} - ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  warn(message: string, data: unknown = null): void {
    if (this.enabled) {
      const timestamp = new Date().toISOString();
      console.warn(`[WARN] ${timestamp} - ${message}`);
      if (data) {
        console.warn(JSON.stringify(data, null, 2));
      }
    }
  }

  debug(message: string, data: unknown = null): void {
    if (this.enabled && config.logging.level === 'debug') {
      const timestamp = new Date().toISOString();
      console.log(`[DEBUG] ${timestamp} - ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  // Specialized logging methods
  auth(action: string, email: string, data: unknown = null): void {
    this.info(`[AUTH] ${action} - ${email}`, data);
  }

  transaction(action: string, userId: number | string, data: unknown = null): void {
    this.info(`[TRANSACTION] ${action} - User: ${userId}`, data);
  }

  investment(action: string, symbol: string, data: unknown = null): void {
    this.info(`[INVESTMENT] ${action} - ${symbol}`, data);
  }

  ai(action: string, userId: number | string, data: unknown = null): void {
    this.info(`[AI] ${action} - User: ${userId}`, data);
  }

  email(action: string, recipient: string, data: unknown = null): void {
    this.info(`[EMAIL] ${action} - ${recipient}`, data);
  }
}

export = new Logger(); 