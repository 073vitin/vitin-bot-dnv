const telemetry = require("../telemetryService")

async function handleUtilityCommands(ctx) {
  const {
    sock,
    from,
    sender,
    cmd,
    prefix,
    isGroup,
    msg,
    quoted,
    mentioned,
    sharp,
    downloadMediaMessage,
    logger,
    videoToSticker,
    dddMap,
    jidNormalizedUser,
    getPunishmentDetailsText,
    isOverrideSender,
  } = ctx

  const buildCommandManualPages = () => {
    return [
      `📚 Manual completo de comandos (inclui ocultos/restritos)\n\n` +
      `Regras gerais:\n` +
      `- Prefixo padrão: ${prefix}\n` +
      `- [arg] = opcional | <arg> = obrigatório\n` +
      `- Comandos de grupo exigem execução em grupo\n\n` +
      `MENU / UTILITÁRIOS\n` +
      `- ${prefix}menu\n` +
      `  Uso: ${prefix}menu\n` +
      `  Faz: abre o menu principal.\n` +
      `- ${prefix}jid (oculto, DM)\n` +
      `  Uso: ${prefix}jid\n` +
      `  Faz: mostra identificadores do remetente (raw/normalizado/@s.whatsapp.net/@lid).\n` +
      `- ${prefix}punicoeslista / ${prefix}puniçõeslista\n` +
      `  Uso: ${prefix}punicoeslista\n` +
      `  Faz: envia no privado a lista detalhada de punições.\n` +
      `- ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f\n` +
      `  Uso: ${prefix}s (com imagem/vídeo enviado ou citado)\n` +
      `  Faz: converte mídia em figurinha.\n` +
      `- ${prefix}roleta\n` +
      `  Uso: ${prefix}roleta\n` +
      `  Faz: sorteia um participante e manda frase aleatória.\n` +
      `- ${prefix}bombardeio @user\n` +
      `  Uso: ${prefix}bombardeio @usuario\n` +
      `  Faz: sequência humorística de "rastreamento" do alvo.\n` +
      `- ${prefix}gay @user\n` +
      `  Uso: ${prefix}gay @usuario\n` +
      `  Faz: retorna porcentagem aleatória.\n` +
      `- ${prefix}gado @user\n` +
      `  Uso: ${prefix}gado @usuario\n` +
      `  Faz: retorna porcentagem aleatória.\n` +
      `- ${prefix}ship @a @b\n` +
      `  Uso: ${prefix}ship @usuario1 @usuario2\n` +
      `  Faz: calcula compatibilidade aleatória.\n` +
      `- ${prefix}treta\n` +
      `  Uso: ${prefix}treta\n` +
      `  Faz: escolhe dois participantes e gera treta aleatória.`,

      `🎮 Jogos e lobbies\n\n` +
      `- ${prefix}brincadeiras\n` +
      `  Uso: ${prefix}brincadeiras\n` +
      `  Faz: mostra submenu de brincadeiras.\n` +
      `- ${prefix}jogos\n` +
      `  Uso: ${prefix}jogos\n` +
      `  Faz: mostra submenu de jogos e sintaxe de lobbies.\n` +
      `- ${prefix}jogos stats\n` +
      `  Uso: ${prefix}jogos stats\n` +
      `  Faz: exibe estatísticas de jogos do usuário.\n` +
      `- ${prefix}moeda\n` +
      `  Uso: ${prefix}moeda\n` +
      `  Faz: inicia rodada de cara ou coroa para o usuário.\n` +
      `- cara\n` +
      `  Uso: cara\n` +
      `  Faz: resposta da rodada ativa de moeda (sem prefixo).\n` +
      `- coroa\n` +
      `  Uso: coroa\n` +
      `  Faz: resposta da rodada ativa de moeda (sem prefixo).\n` +
      `- ${prefix}moeda dobro\n` +
      `  Uso: ${prefix}moeda dobro\n` +
      `  Faz: alterna modo Dobro ou Nada do !moeda no grupo.\n` +
      `- ${prefix}moeda dobroounada\n` +
      `  Uso: ${prefix}moeda dobroounada\n` +
      `  Faz: alias do comando acima.\n` +
      `- ${prefix}moeda dobrounada\n` +
      `  Uso: ${prefix}moeda dobrounada\n` +
      `  Faz: alias do comando acima.\n` +
      `- ${prefix}streak\n` +
      `  Uso: ${prefix}streak [@usuario]\n` +
      `  Faz: mostra streak atual de moeda.\n` +
      `- ${prefix}streakranking\n` +
      `  Uso: ${prefix}streakranking\n` +
      `  Faz: ranking de streaks máximas/atuais do grupo.\n` +
      `- ${prefix}entrar / ${prefix}join\n` +
      `  Uso: ${prefix}entrar <LobbyID> | ${prefix}join <LobbyID>\n` +
      `  Faz: entra em lobby aberto.\n` +
      `- ${prefix}lobbies\n` +
      `  Uso: ${prefix}lobbies\n` +
      `  Faz: lista lobbies abertos no grupo.\n` +
      `- ${prefix}começar / ${prefix}comecar / ${prefix}start\n` +
      `  Uso: ${prefix}começar <adivinhacao|batata|dados|rr>\n` +
      `  Faz: cria lobby desse jogo e entra automaticamente no lobby.`,

      `🎯 Fluxo de partidas\n\n` +
      `- ${prefix}começar / ${prefix}comecar / ${prefix}start\n` +
      `  Uso: ${prefix}começar <LobbyID> [apostaRR]\n` +
      `  Faz: inicia partida do lobby (em RR aceita aposta 0..5).\n` +
      `- ${prefix}resposta\n` +
      `  Uso: ${prefix}resposta <numero> | ${prefix}resposta <LobbyID> <numero>\n` +
      `  Faz: chute no jogo Adivinhação.\n` +
      `- ${prefix}passa\n` +
      `  Uso: ${prefix}passa @usuario | ${prefix}passa <LobbyID> @usuario\n` +
      `  Faz: passa a batata no Batata Quente.\n` +
      `- ${prefix}rolar\n` +
      `  Uso: ${prefix}rolar | ${prefix}rolar <LobbyID>\n` +
      `  Faz: rola dado no Duelo de Dados.\n` +
      `- ${prefix}atirar\n` +
      `  Uso: ${prefix}atirar | ${prefix}atirar <LobbyID>\n` +
      `  Faz: executa turno na Roleta Russa.\n` +
      `- ${prefix}embaralhado\n` +
      `  Uso: ${prefix}embaralhado\n` +
      `  Faz: inicia Embaralhado manualmente (grupo, min 3).\n` +
      `- ${prefix}começar embaralhado\n` +
      `  Uso: ${prefix}começar embaralhado\n` +
      `  Faz: alias para iniciar Embaralhado.\n` +
      `- ${prefix}começar memória\n` +
      `  Uso: ${prefix}começar memória\n` +
      `  Faz: inicia Memória manualmente (min 3).\n` +
      `- ${prefix}comecar memoria\n` +
      `  Uso: ${prefix}comecar memoria\n` +
      `  Faz: alias sem acento para Memória.\n` +
      `- ${prefix}começar reação\n` +
      `  Uso: ${prefix}começar reação\n` +
      `  Faz: inicia Reação manualmente (min 3).\n` +
      `- ${prefix}comecar reacao\n` +
      `  Uso: ${prefix}comecar reacao\n` +
      `  Faz: alias sem acento para Reação.\n` +
      `- ${prefix}começar comando\n` +
      `  Uso: ${prefix}começar comando\n` +
      `  Faz: inicia jogo Comando manualmente (min 3).\n` +
      `- Resposta da Memória (sem prefixo)\n` +
      `  Uso: <12 caracteres alfanuméricos>\n` +
      `  Faz: tentativa de resolver Memória ativa.`,

      `💰 Economia\n\n` +
      `- ${prefix}economia\n` +
      `  Uso: ${prefix}economia\n` +
      `  Faz: abre submenu de economia.\n` +
      `- ${prefix}perfil stats\n` +
      `  Uso: ${prefix}perfil stats\n` +
      `  Faz: mostra estatísticas econômicas detalhadas do usuário.\n` +
      `- ${prefix}perfil\n` +
      `  Uso: ${prefix}perfil [@usuario]\n` +
      `  Faz: carteira, escudos, inventário e status Kronos.\n` +
      `- ${prefix}extrato\n` +
      `  Uso: ${prefix}extrato [@usuario]\n` +
      `  Faz: últimas 10 movimentações do usuário.\n` +
      `- ${prefix}coinsranking\n` +
      `  Uso: ${prefix}coinsranking\n` +
      `  Faz: ranking de moedas do grupo + posição global do autor.\n` +
      `- ${prefix}loja\n` +
      `  Uso: ${prefix}loja\n` +
      `  Faz: mostra catálogo da loja.\n` +
      `- ${prefix}comprar\n` +
      `  Uso: ${prefix}comprar <item|indice> [quantidade]\n` +
      `  Faz: compra item para o próprio inventário.\n` +
      `- ${prefix}comprarpara\n` +
      `  Uso: ${prefix}comprarpara @usuario <item> [quantidade]\n` +
      `  Faz: compra item para outro usuário.\n` +
      `- ${prefix}vender\n` +
      `  Uso: ${prefix}vender <item> [quantidade]\n` +
      `  Faz: vende item do inventário.\n` +
      `- ${prefix}doarcoins\n` +
      `  Uso: ${prefix}doarcoins @usuario [quantidade]\n` +
      `  Faz: transfere moedas para outro jogador.\n` +
      `- ${prefix}doaritem\n` +
      `  Uso: ${prefix}doaritem @usuario <item> [quantidade]\n` +
      `  Faz: transfere item para outro jogador.\n` +
      `- ${prefix}roubar\n` +
      `  Uso: ${prefix}roubar @usuario\n` +
      `  Faz: tenta roubar moedas com risco de falha/perda.\n` +
      `- ${prefix}daily\n` +
      `  Uso: ${prefix}daily\n` +
      `  Faz: resgata recompensa diária (1x por dia).\n` +
      `- ${prefix}cassino\n` +
      `  Uso: ${prefix}cassino\n` +
      `  Faz: mostra regras do cassino.\n` +
      `- ${prefix}aposta\n` +
      `  Uso: ${prefix}aposta <valor>\n` +
      `  Faz: aposta no cassino (resultado aleatório com multiplicadores).`,

      `🛠️ Economia avançada / moderação\n\n` +
      `- ${prefix}lootbox\n` +
      `  Uso: ${prefix}lootbox <quantidade>\n` +
      `  Faz: abre lootboxes e aplica efeitos/punições sorteadas.\n` +
      `- ${prefix}falsificar\n` +
      `  Uso: ${prefix}falsificar <tipo 1-13> [severidade] [quantidade]\n` +
      `  Faz: operação de falsificação de passes (pode melhorar/piorar resultado).\n` +
      `- ${prefix}usarpasse\n` +
      `  Uso: ${prefix}usarpasse @usuario <tipo 1-13> <severidade>\n` +
      `  Faz: consome passe do inventário e aplica punição no alvo.\n` +
      `- ${prefix}trabalho\n` +
      `  Uso: ${prefix}trabalho <ifood|capinar|lavagem>\n` +
      `  Faz: trabalho diário com chance de ganho/perda.\n` +
      `- ${prefix}setcoins\n` +
      `  Uso: ${prefix}setcoins [@usuario] <quantidade>\n` +
      `  Faz: define saldo exato do alvo (admin).\n` +
      `- ${prefix}addcoins\n` +
      `  Uso: ${prefix}addcoins [@usuario] <quantidade>\n` +
      `  Faz: adiciona moedas no alvo (admin).\n` +
      `- ${prefix}removecoins\n` +
      `  Uso: ${prefix}removecoins [@usuario] <quantidade>\n` +
      `  Faz: remove moedas do alvo (admin).\n` +
      `- ${prefix}additem\n` +
      `  Uso: ${prefix}additem [@usuario] <item> <quantidade>\n` +
      `  Faz: adiciona item no inventário do alvo (admin).\n` +
      `- ${prefix}additem (passe)\n` +
      `  Uso: ${prefix}additem [@usuario] passe <tipo 1-13> <severidade> <quantidade>\n` +
      `  Faz: adiciona passe de punição específico (admin).\n` +
      `- ${prefix}removeitem\n` +
      `  Uso: ${prefix}removeitem [@usuario] <item> <quantidade>\n` +
      `  Faz: remove item do inventário (admin).\n` +
      `- ${prefix}mute\n` +
      `  Uso: ${prefix}mute [@usuario]\n` +
      `  Faz: silencia usuário no grupo (admin).\n` +
      `- ${prefix}unmute\n` +
      `  Uso: ${prefix}unmute [@usuario]\n` +
      `  Faz: remove mute manual do usuário (admin).\n` +
      `- ${prefix}ban\n` +
      `  Uso: ${prefix}ban [@usuario]\n` +
      `  Faz: remove usuário do grupo (admin).\n` +
      `- ${prefix}adminadd\n` +
      `  Uso: ${prefix}adminadd @usuario\n` +
      `  Faz: promove usuário para admin do grupo.\n` +
      `- ${prefix}adminrm\n` +
      `  Uso: ${prefix}adminrm @usuario\n` +
      `  Faz: remove admin de usuário no grupo.\n` +
      `- ${prefix}punições / ${prefix}punicoes\n` +
      `  Uso: ${prefix}punicoes [@usuario]\n` +
      `  Faz: lista punições ativas e pendências do alvo.\n` +
      `- ${prefix}puniçõesclr / ${prefix}punicoesclr\n` +
      `  Uso: ${prefix}punicoesclr [@usuario]\n` +
      `  Faz: limpa punições ativas e pendências do alvo.\n` +
      `- ${prefix}puniçõesadd / ${prefix}punicoesadd\n` +
      `  Uso: ${prefix}punicoesadd [@usuario] <1-13> [multiplicador]\n` +
      `  Faz: aplica punição manual por ID no alvo.\n` +
      `- ${prefix}resenha\n` +
      `  Uso: ${prefix}resenha\n` +
      `  Faz: liga/desliga punições relacionadas aos jogos (admin).\n` +
      `- ${prefix}adm\n` +
      `  Uso: ${prefix}adm\n` +
      `  Faz: abre menu de moderação/admin.\n` +
      `- ${prefix}admeconomia\n` +
      `  Uso: ${prefix}admeconomia\n` +
      `  Faz: abre menu de admin da economia.\n\n` +
      `OCULTOS / RESTRITOS\n` +
      `- ${prefix}toggleover (oculto, DM, somente override)\n` +
      `  Uso: ${prefix}toggleover\n` +
      `  Faz: liga/desliga globalmente todos os checks de override.\n` +
      `- ${prefix}nuke (restrito override, grupo)\n` +
      `  Uso: ${prefix}nuke\n` +
      `  Faz: limpa punições e pendências do próprio override no grupo.\n` +
      `- ${prefix}overridetest (oculto, restrito override, grupo)\n` +
      `  Uso: ${prefix}overridetest\n` +
      `  Faz: testa punições hostis no remetente e limpa ao final.\n` +
      `- ${prefix}comandosfull (oculto, DM, somente override)\n` +
      `  Uso: ${prefix}comandosfull\n` +
      `  Faz: envia este manual completo.`,
    ]
  }

  let media =
    msg.message?.imageMessage ||
    msg.message?.videoMessage ||
    quoted?.imageMessage ||
    quoted?.videoMessage

  function trackUtility(command, status, meta = {}) {
    telemetry.incrementCounter("router.utility.command", 1, {
      command,
      status,
    })
    telemetry.appendEvent("router.utility.command", {
      command,
      status,
      groupId: from,
      sender,
      ...meta,
    })
  }

  if (cmd === prefix + "menu") {
    trackUtility("menu", "success")
    await sock.sendMessage(from, {
      text:
`╭━━━〔 🤖 VITIN BOT 〕━━━╮
│ 👑 Status: Online
│ ⚙️ Sistema: Baileys
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎨 FIGURINHAS 〕━━━╮
│ ${prefix}s / ${prefix}fig / ${prefix}sticker / ${prefix}f
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 🎮 PASSATEMPOS 〕━━━╮
│ ${prefix}brincadeiras
│ ${prefix}jogos 
│ ${prefix}economia 
│ ${prefix}punicoeslista
╰━━━━━━━━━━━━━━━━━━━━╯

╭━━━〔 ⚡ ADM 〕━━━╮
│ ${prefix}adm
│ ${prefix}admeconomia
╰━━━━━━━━━━━━━━━━━━━━╯`,
    })
    return true
  }

  if (cmd === prefix + "comandosfull") {
    if (isGroup) return false
    if (!isOverrideSender) return false

    const pages = buildCommandManualPages()
    for (const page of pages) {
      await sock.sendMessage(from, { text: page })
    }
    return true
  }

  if (cmd === prefix + "jid") {
    if (isGroup) {
      trackUtility("jid", "rejected", { reason: "group-only-dm-command" })
      return false
    }

    const senderRaw = String(sender || "").trim()
    const senderNormalized = jidNormalizedUser(senderRaw)
    const senderWithoutDevice = senderRaw.split(":")[0]
    const senderUserPart = senderWithoutDevice.split("@")[0]
    const senderSWh = senderUserPart ? `${senderUserPart}@s.whatsapp.net` : ""
    const senderLid = senderUserPart ? `${senderUserPart}@lid` : ""

    const identifiers = [
      senderRaw,
      senderNormalized,
      senderWithoutDevice,
      senderSWh,
      senderLid,
      senderUserPart,
    ].filter(Boolean)

    const uniqueIdentifiers = Array.from(new Set(identifiers))
    trackUtility("jid", "success")
    await sock.sendMessage(from, {
      text: uniqueIdentifiers.join("\n"),
    })
    return true
  }

  if (cmd === prefix + "punicoeslista" || cmd === prefix + "puniçõeslista") {
    trackUtility("punicoeslista", "success")
    const detailsText = typeof getPunishmentDetailsText === "function"
      ? getPunishmentDetailsText()
      : "Lista de punições indisponível no momento."

    await sock.sendMessage(sender, { text: detailsText })
    if (isGroup) {
      await sock.sendMessage(from, {
        text: `📩 @${sender.split("@")[0]}, te enviei a lista de punições no privado.`,
        mentions: [sender],
      })
    }
    return true
  }

  if (cmd === prefix + "s" || cmd === prefix + "fig" || cmd === prefix + "sticker" || cmd === prefix + "f") {
    if (!media) {
      trackUtility("sticker", "rejected", { reason: "missing-media" })
      await sock.sendMessage(from, { text: "Envie ou responda uma mídia!" })
      return true
    }

    try {
      let buffer
      if (msg.message?.imageMessage || msg.message?.videoMessage) {
        buffer = await downloadMediaMessage(msg, "buffer", {}, { logger })
      } else if (quoted?.imageMessage || quoted?.videoMessage) {
        buffer = await downloadMediaMessage({ message: quoted }, "buffer", {}, { logger })
      }

      let sticker
      if (msg.message?.imageMessage || quoted?.imageMessage) {
        sticker = await sharp(buffer)
          .resize({ width: 512, height: 512, fit: "fill" })
          .webp({ quality: 100 })
          .toBuffer()
      } else if (msg.message?.videoMessage || quoted?.videoMessage) {
        sticker = await videoToSticker(buffer)
      }

      await sock.sendMessage(from, { sticker })
      trackUtility("sticker", "success")
    } catch (err) {
      trackUtility("sticker", "error")
      console.error(err)
      await sock.sendMessage(from, { text: "Erro ao criar figurinha!" })
    }
    return true
  }

  if (cmd === prefix + "roleta" && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const botJid = jidNormalizedUser(sock.user?.id || "")
    const participantes = (metadata?.participants || [])
      .map((p) => jidNormalizedUser(p.id))
      .filter((id) => id && id !== botJid)

    if (!participantes.length) {
      trackUtility("roleta", "rejected", { reason: "no-participants" })
      await sock.sendMessage(from, {
        text: "Não foi possível realizar a roleta: nenhum participante encontrado.",
      })
      return true
    }

    const alvo = participantes[Math.floor(Math.random() * participantes.length)]
    const numero = alvo.split("@")[0]

    const frases = [
      `@${numero} foi agraciado a rebolar lentinho pra todos do grupo!`,
      `@${numero} vai ter que pagar babão pro bonde`,
      `@${numero} teve os dados puxados e tivemos uma revelação triste, é adotado...`,
      `@${numero} por que no seu navegador tem pornô de femboy furry?`,
      `@${numero} gabaritou a tabela de DST! Parabéns pela conquista.`,
      `@${numero} foi encontrado na ilha do Epstein...`,
      `@${numero} foi censurado pelo Felca`,
      `@${numero} está dando pro pai de todo mundo do grupo`,
      `@${numero} foi visto numa boate gay no centro de São Paulo`,
      `@${numero} sei que te abandonaram na ilha do Epstein, mas não precisa se afundar em crack...`,
      `@${numero} foi avistado gravando um video para o onlyfans da Leandrinha...`,
      `@${numero} pare de me mandar foto da bunda no privado, ja disse que não vou avaliar!`,
      `@${numero} estava assinando o Privacy do Bluezão quando foi flagrado, você ta bem mano?`,
      `@${numero} teve o histórico do navegador vazado e achamos uma pesquisa estranha... Peppa Pig rule 34?`,
      `@${numero} foi pego pela vó enquanto batia punheta!`,
      `@${numero} teve uma foto constragedora vazada... pera, c ta vestido de empregada?`,
      `@${numero} descobrimos sua conta do OnlyFans!`,
      `@${numero} foi visto comendo o dono do grupo!`,
      `@${numero} viu a namorada beijando outro, não sobra nem o conceito de nada pro beta. Brutal`,
    ]

    const frase = frases[Math.floor(Math.random() * frases.length)]
    await sock.sendMessage(from, { text: frase, mentions: [alvo] })
    trackUtility("roleta", "success")
    return true
  }

  if (cmd.startsWith(prefix + "bombardeio") && mentioned.length > 0 && isGroup) {
    const alvo = mentioned[0]
    const ip = `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`

    const provedores = ["Claro", "Vivo", "Tim", "Oi", "Copel", "NET"]
    const provedor = provedores[Math.floor(Math.random() * provedores.length)]

    const dispositivos = ["Android", "iOS", "Windows PC", "Linux PC"]
    const dispositivo = dispositivos[Math.floor(Math.random() * dispositivos.length)]

    const numero = alvo.split("@")[0]
    const ddd = numero.substring(0, 2)
    const regiao = dddMap[ddd] || "desconhecida"

    const crimes = ["furto", "roubo", "estelionato", "tráfico", "lesão corporal", "homicídio", "contrabando", "vandalismo", "pirataria", "crime cibernético", "fraude", "tráfico de animais", "lavagem de dinheiro", "crime ambiental", "corrupção", "sequestro", "ameaça", "falsificação", "invasão de propriedade", "crime eleitoral"]
    const crime = crimes[Math.floor(Math.random() * crimes.length)]

    await sock.sendMessage(from, { text: `📡 Analisando ficha criminal... (1 crime encontrado: ${crime})`, mentions: [alvo] })

    setTimeout(async () => {
      await sock.sendMessage(from, { text: `💻 IP rastreado: ${ip}`, mentions: [alvo] })
    }, 1500)

    setTimeout(async () => {
      await sock.sendMessage(from, {
        text: `🎯 Alvo identificado!\n📍 Região: ${regiao}\n💻 Provedor: ${provedor}\n📱 Dispositivo: ${dispositivo}\n⚠️ Vulnerabilidade encontrada!\n💣 Iniciando ataque em breve...`,
        mentions: [alvo],
      })
    }, 3000)

    trackUtility("bombardeio", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "gay") && mentioned[0]) {
    const alvo = mentioned[0]
    const numero = alvo.split("@")[0]
    const p = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, { text: `@${numero} é ${p}% gay 🌈`, mentions: [alvo] })
    trackUtility("gay", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "gado") && mentioned[0]) {
    const alvo = mentioned[0]
    const numero = alvo.split("@")[0]
    const p = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, { text: `@${numero} é ${p}% gado 🐂`, mentions: [alvo] })
    trackUtility("gado", "success", { target: alvo })
    return true
  }

  if (cmd.startsWith(prefix + "ship") && mentioned.length >= 2) {
    const p1 = mentioned[0]
    const p2 = mentioned[1]
    const n1 = p1.split("@")[0]
    const n2 = p2.split("@")[0]
    const chance = Math.floor(Math.random() * 101)
    await sock.sendMessage(from, {
      text: `💘 @${n1} + @${n2} = ${chance}%`,
      mentions: [p1, p2],
    })
    trackUtility("ship", "success", { targetA: p1, targetB: p2 })
    return true
  }

  if (cmd === prefix + "treta" && isGroup) {
    const metadata = await sock.groupMetadata(from)
    const botJid = jidNormalizedUser(sock.user?.id || "")
    const participantes = (metadata?.participants || [])
      .map((p) => jidNormalizedUser(p.id))
      .filter((id) => id && id !== botJid)
    if (participantes.length < 2) {
      trackUtility("treta", "rejected", { reason: "insufficient-participants" })
      await sock.sendMessage(from, {
        text: "Não foi possível iniciar a treta: participantes insuficientes.",
      })
      return true
    }
    const p1 = participantes[Math.floor(Math.random() * participantes.length)]
    let p2 = participantes[Math.floor(Math.random() * participantes.length)]
    while (p1 === p2) p2 = participantes[Math.floor(Math.random() * participantes.length)]
    const n1 = p1.split("@")[0]
    const n2 = p2.split("@")[0]

    const motivos = [
      "brigaram por causa de comida",
      "discutiram por causa de mulher",
      `treta começou pois @${n1} tentou ver a pasta trancada de @${n2}`,
      "um chamou o outro de feio kkkkkkkkkkkk",
      "disputa de ego gigantesca",
      `treta começou pois @${n1} falou que era mais forte que @${n2}`,
      "um deve dinheiro pro outro(so tem caloteiro aqui)",
      "brigaram pra ver quem tem o maior pinto",
    ]

    const motivo = motivos[Math.floor(Math.random() * motivos.length)]

    if (motivo === "brigaram pra ver quem tem o maior pinto") {
      const vencedor = Math.random() < 0.5 ? p1 : p2
      const perdedor = vencedor === p1 ? p2 : p1
      const nv = vencedor.split("@")[0]
      const np = perdedor.split("@")[0]
      const tamanhoVencedor = (Math.random() * 20 + 5).toFixed(1)
      const tamanhoPerdedor = (Math.random() * 23 - 20).toFixed(1)
      const finais = [
        `@${np} tem o menor micro pênis já registrado da história! (${tamanhoPerdedor}cm)`,
        `@${nv} ganhou com seus incríveis ${tamanhoVencedor} centímetros!`,
      ]
      const resultado = finais[Math.floor(Math.random() * finais.length)]
      await sock.sendMessage(from, {
        text: `Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
        mentions: [p1, p2],
      })
      trackUtility("treta", "success", { players: [p1, p2] })
      return true
    }

    const resultados = [
      `@${n1} saiu chorando`,
      `@${n2} ficou de xereca`,
      "deu empate, briguem dnv fazendo favor",
      `@${n1} ganhou`,
      `@${n2} pediu arrego`,
    ]
    const resultado = resultados[Math.floor(Math.random() * resultados.length)]
    await sock.sendMessage(from, {
      text: `Ih, os corno começaram a tretar\n\n@${n1} VS @${n2}\n\nMotivo: ${motivo}\nResultado: ${resultado}`,
      mentions: [p1, p2],
    })
    trackUtility("treta", "success", { players: [p1, p2] })
    return true
  }

  return false
}

module.exports = {
  handleUtilityCommands,
}
