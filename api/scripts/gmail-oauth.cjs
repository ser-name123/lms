/*
 * One-time helper to obtain a Gmail API refresh token.
 *
 * The refresh token is the durable credential the server uses to mint access
 * tokens forever after; it is obtained once, by a human consenting in a
 * browser, and cannot be generated server-side. This script drives that flow:
 * it opens the Google consent screen, catches the redirect on a loopback
 * server, and exchanges the code for a refresh token.
 *
 * Prerequisites, done once in Google Cloud Console (console.cloud.google.com):
 *   1. Create a project (or reuse one).
 *   2. APIs & Services -> Library -> enable "Gmail API".
 *   3. APIs & Services -> Credentials -> Create credentials -> OAuth client ID
 *      -> Application type: Web application.
 *   4. Add this Authorized redirect URI EXACTLY:  http://localhost:4571
 *   5. Copy the Client ID and Client secret.
 *   6. OAuth consent screen -> add your Gmail address under Test users
 *      (so an unverified app can still send for it).
 *
 * Run:
 *   node scripts/gmail-oauth.cjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * It prints a URL — open it, choose the gmail.com account, allow "Send email
 * on your behalf" — and then prints the refresh token to paste into
 * Settings -> Email.
 */
const http = require('http');
const crypto = require('crypto');

const PORT = 4571;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const [, , clientId, clientSecret] = process.argv;
if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/gmail-oauth.cjs <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // ask for a refresh token
    prompt: 'consent', // force one even on a re-auth, so we always get it
    state,
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (!url.searchParams.get('code') && !url.searchParams.get('error')) {
    res.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<p>Denied: ${error}. You can close this tab.</p>`);
    console.error(`\nConsent was denied: ${error}`);
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get('state') !== state) {
    res.writeHead(400).end('state mismatch');
    return;
  }

  const code = url.searchParams.get('code');
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.refresh_token) {
      throw new Error(
        `${data.error ?? tokenRes.status}: ${data.error_description ?? 'no refresh_token returned'}` +
          (data.refresh_token === undefined
            ? '\n(If you have authorised this app before, revoke it at myaccount.google.com/permissions and retry — Google only returns a refresh token on first consent.)'
            : ''),
      );
    }

    res
      .writeHead(200, { 'Content-Type': 'text/html' })
      .end('<p>Done. Copy the refresh token from your terminal. You can close this tab.</p>');

    console.log('\n─────────────────────────────────────────────────────────');
    console.log('REFRESH TOKEN (paste into Settings -> Email -> Gmail API):\n');
    console.log(data.refresh_token);
    console.log('\n─────────────────────────────────────────────────────────');
    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500).end('Token exchange failed — see terminal.');
    console.error(`\nToken exchange failed: ${e.message}`);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nListening on ${REDIRECT} for the consent redirect.`);
  console.log('\nOpen this URL in a browser, sign in as the sending account, and allow access:\n');
  console.log(authUrl);
  console.log('');
});
