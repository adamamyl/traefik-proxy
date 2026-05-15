#!/usr/bin/env node
// TLS + HTTP diagnostic for local dev stack — no npm deps required.
// Usage: node scripts/check-local-tls.mjs [url...]

import { connect } from 'node:tls';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO  = resolve(__dir, '..');
const ROOT_CA = resolve(REPO, 'certs', 'step-ca-root.crt');

const URLS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://traefik.localhost/dashboard/', 'https://surveysays.localhost'];

const red    = s => `\x1b[31m${s}\x1b[0m`;
const green  = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const bold   = s => `\x1b[1m${s}\x1b[0m`;

function tlsCheck(hostname, port = 443) {
  return new Promise(res => {
    let ca;
    try { ca = readFileSync(ROOT_CA); } catch { /* no local CA yet */ }
    const socket = connect({ host: hostname, port, servername: hostname, ca, rejectUnauthorized: !!ca }, () => {
      const cert = socket.getPeerCertificate(true);
      socket.destroy();
      res({ ok: true, cert });
    });
    socket.on('error', e => res({ ok: false, error: e.message }));
    socket.setTimeout(5000, () => { socket.destroy(); res({ ok: false, error: 'timeout' }); });
  });
}

function curlCheck(url) {
  try {
    const out = execFileSync('curl', [
      '-s', '--cacert', ROOT_CA, '-o', '/dev/null',
      '-w', '%{http_code} %{ssl_verify_result}',
      '--max-time', '5', url,
    ], { encoding: 'utf8' });
    const [code, sslResult] = out.trim().split(' ');
    return { httpCode: parseInt(code, 10), sslOk: sslResult === '0' };
  } catch (e) {
    return { httpCode: 0, sslOk: false, error: e.message };
  }
}

function fmtCert(cert) {
  const expiry    = new Date(cert.valid_to);
  const daysLeft  = Math.round((expiry - Date.now()) / 86400000);
  const issuer    = Object.entries(cert.issuer  ?? {}).map(([k,v]) => `${k}=${v}`).join(', ');
  const subject   = Object.entries(cert.subject ?? {}).map(([k,v]) => `${k}=${v}`).join(', ');
  const sans      = cert.subjectaltname ?? '(none)';
  const col       = daysLeft < 3 ? red : daysLeft < 14 ? yellow : green;
  return [
    `  subject  : ${subject || '(empty)'}`,
    `  issuer   : ${issuer}`,
    `  valid_to : ${cert.valid_to}  ${col(`(${daysLeft}d remaining)`)}`,
    `  SANs     : ${sans}`,
  ].join('\n');
}

for (const url of URLS) {
  console.log(bold(`\n── ${url}`));
  const { hostname } = new URL(url);

  const tls = await tlsCheck(hostname);
  if (!tls.ok) {
    console.log(red(`  TLS : ${tls.error}`));
  } else {
    console.log(green('  TLS : handshake OK'));
    console.log(fmtCert(tls.cert));
  }

  const http = curlCheck(url);
  const httpCol = http.httpCode >= 200 && http.httpCode < 400 ? green
                : http.httpCode === 0 ? red : yellow;
  const sslTag  = http.sslOk ? green('ssl-verified') : red('ssl-FAILED');
  console.log(`  HTTP: ${httpCol(`${http.httpCode}`)}  ${sslTag}${http.error ? '  ' + red(http.error) : ''}`);
}
