module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
  },
  // On serverless hosts (Vercel) a relative path finds no locale files at
  // request time; resolve from the project root on the server.
  localePath:
    typeof window === 'undefined'
      ? require('path').resolve('./public/locales')
      : '/locales',
};
