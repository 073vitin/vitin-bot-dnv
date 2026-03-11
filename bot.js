const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const http = require('http');

const logger = pino({ level: 'info' });
const QR_PATH = path.join(__dirname, 'qr.png');

async function start() {
    try {
        console.log('🚀 Iniciando Vitin...');
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        const { version } = await fetchLatestBaileysVersion();
        console.log('📦 Versão:', version);

        const sock = makeWASocket({
            version,
            logger,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '120']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            if (qr) {
                qrcode.toFile(QR_PATH, qr, { width: 300, margin: 2 }, (err) => {
                    if (!err) {
                        console.log('✅ QR salvo em: qr.png');
                        console.log('📱 Acesse: http://localhost:3000/qr.html');
                    }
                });
            }
            
            if (connection === 'open') {
                console.log('✅ BOT ONLINE!');
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) setTimeout(start, 3000);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages;
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            
            if (text === '!ola') {
                await sock.sendMessage(from, { text: 'Oi!' });
            }
        });

    } catch (e) {
        console.log('❌ Erro:', e.message);
        setTimeout(start, 5000);
    }
}

// Servidor HTTP para servir QR
http.createServer((req, res) => {
    if (req.url === '/qr.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>QR Code</title>
    <style>
        body { display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f0f0; }
        .container { text-align: center; background: white; padding: 20px; border-radius: 10px; }
        img { width: 400px; height: 400px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 Escaneie o QR</h1>
        <img src="/qr.png" alt="QR">
    </div>
</body>
</html>
        `);
    } else if (req.url === '/qr.png') {
        fs.readFile(QR_PATH, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('QR não encontrado');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(data);
        });
    } else {
        res.writeHead(200);
        res.end('Bot rodando!');
    }
}).listen(3000, () => console.log('🌐 Servidor rodando na porta 3000'));

start();
