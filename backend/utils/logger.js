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