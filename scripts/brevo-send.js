
const https = require('https');

const BREVO_KEY = process.env.BREVO_API_KEY;
const SENDER = { name: 'Safwane — zmimer.dev', email: 'contact@mindforge-ia.com' };
const REPLY_TO = { email: 'contact.zmimax@gmail.com', name: 'Safwane' };

function sendEmail(to, subject, html, senderName) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender: senderName ? { name: senderName, email: 'contact@mindforge-ia.com' } : SENDER,
      replyTo: REPLY_TO,
      to: [{ email: to }],
      subject,
      htmlContent: html
    });
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': BREVO_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendEmail, BREVO_KEY, SENDER, REPLY_TO };
