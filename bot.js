const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const http = require('http');

const logger = pino({ level: 'fatal' });

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger,
            auth: state,
            browser: ['Ubuntu', 'Chrome', '120'],
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, qr, lastDisconnect } = update;
            
            // ✅ Só gera QR se não estiver conectado
            if (qr && !sock.user) {
                console.log('═══════════════════════════════════════');
                console.log('📱 ESCANEIE O QR ABAIXO:');
                console.log('═══════════════════════════════════════');
                qrcode.generate(qr, { small: true });
                console.log('═══════════════════════════════════════');
            }
            
            if (connection === 'open') {
                console.log('✅ BOT ONLINE!');
                console.log('👤 Conectado como:', sock.user?.id);
            }
            
            if (connection === 'close') {
                if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(start, 3000);
                }
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages;
            if (!msg.message) return;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const isGroup = from.endsWith('@g.us');

            if (text === '!ola') {
                await sock.sendMessage(from, { text: 'Não posso responder agora, estou ocupado comendo o Kronos' });
            }

            if ((text === '!s' || text === '!sticker') && (msg.message.imageMessage || msg.message.videoMessage)) {
                const media = await sock.downloadMediaMessage(msg.message);
                await sock.sendMessage(from, { sticker: media });
            }

            if (text?.startsWith('!ban ') && isGroup) {
                const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    await sock.groupParticipantsUpdate(from, mentioned, 'remove');
                    await sock.sendMessage(from, { text: 'Você atrapalhou minha foda, receba a gozada divina 🍆💦' });
                }
            }
        });

    } catch (e) {
        setTimeout(start, 5000);
    }
}

// Servidor HTTP para o Render
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot rodando!');
}).listen(3000, () => {
    console.log('🌐 Servidor HTTP na porta 3000');
    setTimeout(() => {
        console.log('⏳ Bot iniciando em 5 segundos...');
        start();
    }, 5000);
});
