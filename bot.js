process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require("@whiskeysockets/baileys")
const express = require("express")
const pino = require("pino")
const QRCode = require("qrcode")
const sharp = require("sharp")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const ffmpegPath = require("ffmpeg-static")

ffmpeg.setFfmpegPath(ffmpegPath)

const app = express()
const logger = pino({ level: "silent" })

const dono = "5573998579450@s.whatsapp.net"

let qrImage = null
let muted = {}

app.get("/", (req,res)=>{

if(!qrImage){
return res.send("<h2>Bot conectado ou aguardando reconexão...</h2>")
}

res.send(`
<h2>Escaneie o QR Code</h2>
<img src="${qrImage}">
`)

})

const PORT = process.env.PORT || 3000

app.listen(PORT,()=>{
console.log("Servidor rodando na porta " + PORT)
})

async function videoToSticker(buffer){

const input = "./input.mp4"
const output = "./output.webp"

fs.writeFileSync(input, buffer)

await new Promise((resolve,reject)=>{
ffmpeg(input)
.outputOptions([
"-vcodec libwebp",
"-vf scale=512:512:force_original_aspect_ratio=increase,fps=15",
"-loop 0",
"-ss 00:00:00",
"-t 10",
"-preset default",
"-an",
"-vsync 0"
])
.toFormat("webp")
.save(output)
.on("end", resolve)
.on("error", reject)
})

const sticker = fs.readFileSync(output)

fs.unlinkSync(input)
fs.unlinkSync(output)

return sticker

}

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("./auth_info")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({

version,
auth: state,
logger,
printQRInTerminal:false,
browser:["BotZap","Chrome","1.0"]

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

if(reason !== DisconnectReason.loggedOut){
setTimeout(startBot,5000)
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

const cmd = text.toLowerCase()

const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

let quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

let media =
msg.message.imageMessage ||
msg.message.videoMessage ||
msg.message.stickerMessage ||
quoted?.imageMessage ||
quoted?.videoMessage ||
quoted?.stickerMessage

let isAdmin = false

if(isGroup){

const group = await sock.groupMetadata(from)

const admins = group.participants.filter(p=>p.admin).map(p=>p.id)

isAdmin = admins.includes(sender)

}

if(isGroup && muted[from] && muted[from].includes(sender)){
await sock.sendMessage(from,{ delete: msg.key })
return
}

if(cmd === "!menu"){

await sock.sendMessage(from,{
text:`🤖 MENU

!fig
!f
!s
!sticker

!mute
!unmute
!ban

!dono
`
})

}

if(cmd === "!dono"){

await sock.sendMessage(from,{
text:"👑 Dono do bot",
mentions:[dono]
})

}

if(["!fig","!f","!s","!sticker"].includes(cmd)){

if(!media) return

await sock.sendMessage(from,{
text:"Aguarde um momento, estou fazendo sua figurinha"
})

let mediaMsg = quoted ? { message: quoted } : msg

const buffer = await sock.downloadMediaMessage(mediaMsg)

if(media?.seconds && media.seconds > 10){

await sock.sendMessage(from,{
text:"Vídeo muito longo (máx 10s)"
})

return

}

let sticker

if(media.imageMessage){

sticker = await sharp(buffer)
.resize(512,512,{fit:"cover"})
.webp()
.toBuffer()

}else{

sticker = await videoToSticker(buffer)

}

await sock.sendMessage(from,{
sticker
})

}

if(cmd.startsWith("!mute") && mentioned.length){

if(!isAdmin) return

let alvo = mentioned[0]

if(alvo === dono) return

if(!muted[from]) muted[from] = []

muted[from].push(alvo)

await sock.sendMessage(from,{
text:"Usuário mutado 🤫"
})

}

if(cmd.startsWith("!unmute") && mentioned.length){

if(!isAdmin) return

let alvo = mentioned[0]

if(muted[from]){
muted[from] = muted[from].filter(u => u !== alvo)
}

await sock.sendMessage(from,{
text:"Usuário desmutado 🔊"
})

}

if(cmd.startsWith("!ban") && mentioned.length && isGroup){

if(!isAdmin) return

let alvo = mentioned[0]

const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"

if(alvo === dono){
await sock.sendMessage(from,{text:"Não posso banir meu dono"})
return
}

if(alvo === botNumber){
await sock.sendMessage(from,{text:"Não posso me banir"})
return
}

await sock.groupParticipantsUpdate(from,[alvo],"remove")

}

})

}

startBot()
