const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

// Log
const logger = pino({ level: 'info' });

async function start() {
    try {
        console.log('🚀 Iniciando Vitin come o Kronos...');
        
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        const { version } = await fetchLatestBaileysVersion();

        console.log('📦 Versão do Baileys:', version);

        const sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: true, // ✅ QR aparece no terminal!
            auth: state,
            browser: ['Ubuntu', 'Chrome', '120']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log('');
                console.log('═══════════════════════════════════════');
                console.log('✅ VITIN COME O KRONOS ESTÁ ONLINE!');
                console.log('═══════════════════════════════════════');
                console.log('');
            }
            
            if (connection === 'close') {
                console.log('⚠️ Conexão perdida. Reconectando...');
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
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

            try {
                // Comando: !ola
                if (text === '!ola') {
                    await sock.sendMessage(from, { text: 'Não posso responder agora, estou ocupado comendo o Kronos' });
                    return;
                }

                // Comando: !s ou !sticker
                if ((text === '!s' || text === '!sticker') && (msg.message.imageMessage || msg.message.videoMessage)) {
                    await sock.sendMessage(from, { text: 'Estou terminando de comer o Kronos, aguarde um momento' });
                    const media = await sock.downloadMediaMessage(msg.message);
                    await sock.sendMessage(from, { sticker: media });
                    return;
                }

                // Comando: !ban @nome
                if (text?.startsWith('!ban ') && isGroup) {
                    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (mentioned && mentioned.length > 0) {
                        try {
                            await sock.groupParticipantsUpdate(from, mentioned, 'remove');
                            await sock.sendMessage(from, { text: 'Você atrapalhou minha foda, receba a gozada divina 🍆💦' });
                        } catch (e) {
                            await sock.sendMessage(from, { text: 'Erro ao banir. Talvez eu não seja admin?' });
                        }
                    }
                    return;
                }

            } catch (e) {
                console.log('❌ Erro ao processar mensagem:', e.message);
            }
        });

    } catch (e) {
        console.log('❌ Erro ao iniciar:', e.message);
        setTimeout(start, 5000);
    }
}

start();
