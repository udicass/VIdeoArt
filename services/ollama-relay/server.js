/**
 * Ollama HTTPS Relay — gesture-3d local service
 *
 * Runs a local HTTPS server on port 11435 that proxies requests to the
 * Ollama HTTP server on port 11434. This lets the production Vercel site
 * (https://gesture-3d.vercel.app) reach local Ollama without mixed-content blocks.
 *
 * Prerequisites: run setup.ps1 once to generate and trust the certificate.
 * Then run  start.ps1  (or  node server.js) to keep the relay active.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RELAY_PORT = Number(process.env.RELAY_PORT || 11435);
const OLLAMA_PORT = Number(process.env.OLLAMA_PORT || 11434);

const PFX_PATH = path.join(__dirname, 'relay.pfx');
const PWD_PATH = path.join(__dirname, '.cert-password');

if (!fs.existsSync(PFX_PATH)) {
    console.error('\n  relay.pfx not found. Run setup.ps1 first.\n');
    process.exit(1);
}

const pfx = fs.readFileSync(PFX_PATH);
const passphrase = fs.existsSync(PWD_PATH) ? fs.readFileSync(PWD_PATH, 'utf8').trim() : '';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
};

const server = https.createServer({ pfx, passphrase }, (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        return res.end();
    }

    // Forward all headers, but fix host and drop hop-by-hop headers
    const headers = Object.assign({}, req.headers);
    headers['host'] = `localhost:${OLLAMA_PORT}`;
    delete headers['connection'];
    delete headers['keep-alive'];
    delete headers['upgrade'];

    const proxyReq = http.request({
        hostname: 'localhost',
        port: OLLAMA_PORT,
        path: req.url,
        method: req.method,
        headers
    }, (proxyRes) => {
        const outHeaders = Object.assign({}, proxyRes.headers, CORS);
        // Remove content-length when adding CORS may change body — keep it for plain proxying
        res.writeHead(proxyRes.statusCode, outHeaders);
        // Pipe supports streaming NDJSON responses from Ollama (api/chat, api/generate)
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        if (!res.headersSent) {
            const body = JSON.stringify({ error: `Ollama relay error: ${err.message}` });
            res.writeHead(502, Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, CORS));
            res.end(body);
        }
    });

    // Pipe request body directly — handles large bodies and streaming uploads
    req.pipe(proxyReq, { end: true });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n  Port ${RELAY_PORT} is already in use — relay may already be running.\n`);
    } else {
        console.error('\n  Server error:', err.message, '\n');
    }
    process.exit(1);
});

server.listen(RELAY_PORT, '127.0.0.1', () => {
    console.log('');
    console.log('  Ollama HTTPS relay running');
    console.log(`  Listening : https://localhost:${RELAY_PORT}`);
    console.log(`  Proxying  : http://localhost:${OLLAMA_PORT}`);
    console.log('');
    console.log('  gesture-3d.vercel.app will now reach your local Ollama.');
    console.log('  Keep this window open while using the live site.');
    console.log('');
});

process.on('SIGINT', () => {
    console.log('\n  Relay stopped.\n');
    server.close(() => process.exit(0));
});
