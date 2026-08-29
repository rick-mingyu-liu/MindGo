const config = require('../config');

class Logger {
  constructor() {
    this.enabled = config.logging.enableConsoleLogs;
  }

  info(message, data = null) {
    if (this.enabled) {
      const timestamp = new Date().toISOString();
      console.log(`[INFO] ${timestamp} - ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] ${timestamp} - ${message}`);
    if (error) {
      console.error(error.stack || error);
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
   * See IMPROVEMENTS.md item 17, decision D. The general fix — giving this
   * class a real level hierarchy, since `level` today gates only `debug()` —
   * is item 19.
   */
  audit(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] ${timestamp} - ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  warn(message, data = null) {
    if (this.enabled) {
      const timestamp = new Date().toISOString();
      console.warn(`[WARN] ${timestamp} - ${message}`);
      if (data) {
        console.warn(JSON.stringify(data, null, 2));
      }
    }
  }

  debug(message, data = null) {
    if (this.enabled && config.logging.level === 'debug') {
      const timestamp = new Date().toISOString();
      console.log(`[DEBUG] ${timestamp} - ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
  }

  // Specialized logging methods
  auth(action, email, data = null) {
    this.info(`[AUTH] ${action} - ${email}`, data);
  }

  transaction(action, userId, data = null) {
    this.info(`[TRANSACTION] ${action} - User: ${userId}`, data);
  }

  investment(action, symbol, data = null) {
    this.info(`[INVESTMENT] ${action} - ${symbol}`, data);
  }

  ai(action, userId, data = null) {
    this.info(`[AI] ${action} - User: ${userId}`, data);
  }

  email(action, recipient, data = null) {
    this.info(`[EMAIL] ${action} - ${recipient}`, data);
  }
}

module.exports = new Logger(); 