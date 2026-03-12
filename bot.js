process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")

const app = express()
const logger = pino({ level: "silent" })

let qrImage = null
let muted = {}

app.get("/", (req,res)=>{

if(!qrImage){
return res.send("<h2>Bot conectado ou aguardando reconexão...</h2>")
}

res.send(`
<h2>Escaneie o QR Code</h2>
<img src="${qrImage}">
<p>Atualize a página se mudar</p>
`)

})

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{
console.log("Servidor rodando na porta " + PORT)
})

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({

version,
auth: state,
logger,
printQRInTerminal:false,
browser:["BotZap","Chrome","1.0"],
keepAliveIntervalMs:30000,
connectTimeoutMs:60000,
defaultQueryTimeoutMs:0

})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", async (update)=>{

const { connection, qr, lastDisconnect } = update

if(qr){
qrImage = await QRCode.toDataURL(qr)
console.log("QR GERADO")
}

if(connection === "open"){
console.log("BOT ONLINE")
qrImage = null
}

if(connection === "close"){

const reason = lastDisconnect?.error?.output?.statusCode

console.log("Conexão fechada")

if(reason !== DisconnectReason.loggedOut){

console.log("Reconectando em 5 segundos")

setTimeout(()=>{
startBot()
},5000)

}

}

})

sock.ev.on("messages.upsert", async ({messages})=>{

const msg = messages[0]
if(!msg.message) return
if(msg.key.fromMe) return

const from = msg.key.remoteJid
const sender = msg.key.participant || msg.key.remoteJid
const isGroup = from.endsWith("@g.us")

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
""

const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

if(isGroup && muted[from] && muted[from].includes(sender)){
await sock.sendMessage(from,{ delete: msg.key })
return
}

const cmd = text.toLowerCase()

let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

let media =
msg.message.imageMessage ||
msg.message.videoMessage ||
quoted?.imageMessage ||
quoted?.videoMessage

if(cmd === "!fig" || cmd === "!sticker"){

if(media){

await sock.sendMessage(from,{
text:"Aguarde, estou terminando de comer o Kronos e já te envio a figurinha!"
})

let mediaMsg = quoted ? { message: quoted } : msg

const buffer = await sock.downloadMediaMessage(mediaMsg)

const webpBuffer = await sharp(buffer)
.webp()
.toBuffer()

await sock.sendMessage(from,{
sticker: webpBuffer
})

}

}

if(cmd.startsWith("!mute") && mentioned.length){

let alvo = mentioned[0]

if(!muted[from]) muted[from] = []

muted[from].push(alvo)

await sock.sendMessage(from,{
text:"Não grita 🤫"
})

}

if(cmd.startsWith("!unmute") && mentioned.length){

let alvo = mentioned[0]

if(muted[from]){
muted[from] = muted[from].filter(u => u !== alvo)
}

await sock.sendMessage(from,{
text:"Pode falar nengue"
})

}

if(cmd.startsWith("!ban") && mentioned.length && isGroup){

let alvo = mentioned[0]

let botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"

if(alvo === botNumber){

await sock.sendMessage(from,{
text:"Eu não sou burro de me banir sozinho seu otário"
})

return
}

await sock.groupParticipantsUpdate(from,[alvo],"remove")

await sock.sendMessage(from,{
text:"Receba a leitada divina"
})

}

})

}

startBot()
