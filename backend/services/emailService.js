const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // Change if using another provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendWeeklyReport = async (to, content) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: 'Your Weekly Financial Report',
    text: content,
  });
}; 