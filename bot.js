const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const http = require('http')

const logger = pino({ level: 'silent' })
const mutedUsers = new Set()

async function start() {

const { state, saveCreds } = await useMultiFileAuthState('auth_info')
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
logger,
auth: state,
browser: ['Ubuntu','Chrome','120'],
keepAliveIntervalMs: 10000
})

sock.ev.on('creds.update', saveCreds)

sock.ev.on('connection.update', (update) => {

const { connection, qr, lastDisconnect } = update

if (qr) {
console.log("Escaneie o QR")
qrcode.generate(qr,{small:true})
}

if(connection === 'open'){
console.log("BOT ONLINE")
}

if(connection === 'close'){

const shouldReconnect =
lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

if(shouldReconnect){
console.log("Reconectando...")
start()
}

}

})

sock.ev.on('messages.upsert', async ({messages}) => {

const msg = messages[0]
if(!msg.message) return
if(msg.key.fromMe) return

const from = msg.key.remoteJid
const sender = msg.key.participant || from
const isGroup = from.endsWith('@g.us')

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
""

const mentioned =
msg.message.extendedTextMessage?.contextInfo?.mentionedJid

if(mutedUsers.has(sender)){
await sock.sendMessage(from,{delete:msg.key})
return
}

if(text === "!menu"){

await sock.sendMessage(from,{
text:
`🤖 MENU

📌 Básico
!ola
!ping
!s
!fig
!fsticker texto

😂 Brincadeiras
!beijo
!casar
!ship
!tapa
!abraco
!chute

📊 Rank
!corno
!gay
!rankcorno
!rankgay

👮 Admin
!ban
!mute
!unmute

💀 Extras
!xingamento
!kronos`
})

}

if(text === "!ola"){
await sock.sendMessage(from,{
text:"Não posso responder agora, estou ocupado comendo o Kronos"
})
}

if(text === "!ping" && isGroup){

const group = await sock.groupMetadata(from)
const random =
group.participants[Math.floor(Math.random()*group.participants.length)].id

await sock.sendMessage(from,{
text:`🏓 Pong @${random.split("@")[0]}`,
mentions:[random]
})

}

if((text === "!s" || text === "!fig") && msg.message.imageMessage){

const buffer = await sock.downloadMediaMessage(msg)

await sock.sendMessage(from,{
sticker:buffer
})

}

if((text === "!s" || text === "!fig") && msg.message.videoMessage){

const buffer = await sock.downloadMediaMessage(msg)

await sock.sendMessage(from,{
sticker:buffer
})

}

if(text.startsWith("!fsticker")){

const frase = text.replace("!fsticker","")

await sock.sendMessage(from,{
sticker:{
url:`https://api.memegen.link/images/custom/_/${encodeURIComponent(frase)}.png`
}
})

}

if(text.startsWith("!mute") && mentioned){

mutedUsers.add(mentioned[0])

await sock.sendMessage(from,{
text:"minha gala seca silenciou sua boca piranha >:D"
})

}

if(text.startsWith("!unmute") && mentioned){

mutedUsers.delete(mentioned[0])

await sock.sendMessage(from,{
text:"Usuário desmutado"
})

}

if(text === "!xingamento"){
await sock.sendMessage(from,{
text:"Kronos Kornos Cabeça de Filtro de Barro"
})
}

if(text === "!kronos"){
await sock.sendMessage(from,{
text:"Kronos mais uma vez provando que nasceu com defeito de fábrica."
})
}

if(text.startsWith("!beijo") && mentioned){

const p1 = sender
const p2 = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/4V4xXbL.jpg"},
caption:`💋 @${p1.split("@")[0]} beijou @${p2.split("@")[0]}`,
mentions:[p1,p2]
})

}

if(text.startsWith("!casar") && mentioned){

const p1 = sender
const p2 = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/8QfQ9XG.png"},
caption:`💍 Parabéns

@${p1.split("@")[0]} ❤️ @${p2.split("@")[0]}

Vocês estão casados!`,
mentions:[p1,p2]
})

}

if(text === "!ship" && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const p1 = members[Math.floor(Math.random()*members.length)]
const p2 = members[Math.floor(Math.random()*members.length)]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/6v1Z3Qb.jpg"},
caption:`💘 Ship

@${p1.split("@")[0]} ❤️ @${p2.split("@")[0]}`,
mentions:[p1,p2]
})

}

if(text.startsWith("!tapa") && mentioned){

const p1 = sender
const p2 = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/3d9LQ0K.gif"},
caption:`👋 @${p1.split("@")[0]} deu um tapa em @${p2.split("@")[0]}`,
mentions:[p1,p2]
})

}

if(text.startsWith("!abraco") && mentioned){

const p1 = sender
const p2 = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/FJ8b2dP.gif"},
caption:`🤗 @${p1.split("@")[0]} abraçou @${p2.split("@")[0]}`,
mentions:[p1,p2]
})

}

if(text.startsWith("!chute") && mentioned){

const p1 = sender
const p2 = mentioned[0]

await sock.sendMessage(from,{
image:{url:"https://i.imgur.com/XKp4pYB.gif"},
caption:`🦶 @${p1.split("@")[0]} chutou @${p2.split("@")[0]}`,
mentions:[p1,p2]
})

}

if(text === "!corno" && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const corno = members[Math.floor(Math.random()*members.length)]

await sock.sendMessage(from,{
text:`🐂 O maior corno é @${corno.split("@")[0]}`,
mentions:[corno]
})

}

if(text === "!gay" && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const gay = members[Math.floor(Math.random()*members.length)]
const porcent = Math.floor(Math.random()*101)

await sock.sendMessage(from,{
text:`🏳️‍🌈 @${gay.split("@")[0]} é ${porcent}% gay`,
mentions:[gay]
})

}

if(text === "!rankcorno" && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const escolhidos = members.sort(()=>0.5-Math.random()).slice(0,5)

let msgRank="🐂 Rank Corno\n\n"

escolhidos.forEach((m,i)=>{
const p = Math.floor(Math.random()*101)
msgRank += `${i+1}° @${m.split("@")[0]} - ${p}%\n`
})

await sock.sendMessage(from,{
text:msgRank,
mentions:escolhidos
})

}

if(text === "!rankgay" && isGroup){

const group = await sock.groupMetadata(from)
const members = group.participants.map(p=>p.id)

const escolhidos = members.sort(()=>0.5-Math.random()).slice(0,5)

let msgRank="🏳️‍🌈 Rank Gay\n\n"

escolhidos.forEach((m,i)=>{
const p = Math.floor(Math.random()*101)
msgRank += `${i+1}° @${m.split("@")[0]} - ${p}%\n`
})

await sock.sendMessage(from,{
text:msgRank,
mentions:escolhidos
})

}

})

}

http.createServer((req,res)=>{
res.writeHead(200)
res.end("bot online")
}).listen(3000,()=>{
start()
})
