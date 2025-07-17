const express = require('express');
const request = require('request');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cookieParser());
app.use(express.json()); // Needed for POST

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const SCOPE = [
  'https://mail.google.com/',
  'profile',
  'email'
].join(" ");

app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/auth/google', (req, res) => {
  const url = [
    'https://accounts.google.com/o/oauth2/v2/auth',
    '?response_type=code',
    `&client_id=${CLIENT_ID}`,
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
    `&scope=${encodeURIComponent(SCOPE)}`,
    '&access_type=offline',
    '&prompt=consent'
  ].join('');
  res.redirect(url);
});

app.get('/auth/google/callback', (req, res) => {
  const code = req.query.code;
  request.post('https://oauth2.googleapis.com/token', {
    form: {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    },
    json: true
  }, (_, __, body) => {
    if (body.access_token) {
      res.cookie('access_token', body.access_token);
      res.redirect('/');
    } else {
      res.send('OAuth error: ' + JSON.stringify(body));
    }
  });
});

// Auth check for UI
app.get('/mail/checkauth', (req, res) => {
  const accessToken = req.cookies['access_token'];
  if (!accessToken) return res.status(401).send('No auth');
  // Test token validity by requesting Gmail profile
  request.get('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  }, (_, response, _body) => { // <--- renamed
    if (response && response.statusCode === 200) {
      res.status(200).send('OK');
    } else {
      res.status(401).send('Invalid token');
    }
  });
});

// Send email endpoint
app.post('/mail/send', (req, res) => {
  const accessToken = req.cookies['access_token'];
  if (!accessToken) return res.status(401).send('Not authenticated');
  const { to, subject, message } = req.body;
  if (!to || !subject || !message) return res.status(400).send('Missing fields');
  // Build RFC822 message
  const emailLines = [
    `To: ${to}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    message
  ];
  const email = emailLines.join('\n');
  const raw = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  request.post({
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    json: { raw }
  }, (_, response, body) => {
    if (response && response.statusCode === 200) {
      res.json({ message: "Email sent successfully!" });
    } else {
      let error = (body && body.error && body.error.message) || "Error sending mail.";
      res.status(500).send(error);
    }
  });
});

app.get('/logout', (_, res) => {
  res.clearCookie('access_token');
  res.redirect('/');
});

app.listen(3000, () => console.log('Listening at http://localhost:3000'));