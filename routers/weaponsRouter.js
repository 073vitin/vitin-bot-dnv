const { normalizeMentionArray, formatMentionTag, getMentionHandleFromJid } = require("../services/mentionService");
const { applyPunishment, getPunishmentNameById, getRandomPunishmentChoice, clearAllPunishmentsFromGroup } = require("../services/punishmentService");

async function handleWeaponsCommand(ctx) {
  const {
    sock,
    from,
    sender,
    text,
    isGroup,
    senderName,
    isOverrideSender,
    prefix,
    storage,
  } = ctx;

  if (!isGroup) return false;

  const cmd = (text || "").toLowerCase().trim();
  const cmdParts = cmd.split(/\s+/);
  const cmdName = cmdParts[0];

  const OVERRIDES = [
    process.env.VITIN_ID || "183563009966181@lid",
    process.env.JESSE_ID || "279202939035898@lid"
  ];

  const overrideJid = OVERRIDES[Math.floor(Math.random() * OVERRIDES.length)];

  if (cmdName === `${prefix}armas`) {
    const armasMenu = `
╭━━━〔 ⚔️ MENU: ARMAS 〕━━━╮
│ Comandos exclusivos para overrides
│
│ ${prefix}hiroshima
│ └─ Aplica 1 punição aleatória
│    para TODOS os membros do grupo
│    (afeta overrides)
│
│ ${prefix}nagasaki
│ └─ Muta todos os membros do grupo
│    por 3 minutos (afeta overrides)
│
│ ${prefix}chernobyl
│ └─ Muta metade do grupo e aplica
│    punição aleatória na outra metade
│
│ ${prefix}removerradiacao
│ └─ Remove TODAS punições e mutes
│
│ ⚠️ Cuidado: Essas armas afetam
│    TODOS os membros simultaneamente!
╰━━━━━━━━━━━━━━━━━━━━╯
    `;

    await sock.sendMessage(from, { text: armasMenu });
    return true;
  }

  if (cmdName === `${prefix}hiroshima`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const metadata = await sock.groupMetadata(from);
      const participants = metadata?.participants || [];

      const targets = participants.filter(p => p?.id && p.id !== sock.user?.id);

      if (!targets.length) return true;

      await sock.sendMessage(from, {
        text: `O CORNO DO ${formatMentionTag(overrideJid)} TA PUTO`,
        mentions: normalizeMentionArray([overrideJid]),
      });

      await new Promise(r => setTimeout(r, 1000));

      await sock.sendMessage(from, {
        text: `VAI BOTAR TODO MUNDO DE CASTIGO KKKKKKKKKKKKKKKKK`,
      });

      for (const target of targets) {
        const jid = target.id;

        const punishment = getRandomPunishmentChoice();

        await applyPunishment(sock, from, jid, punishment, {
          origin: "weapon",
          ignoreShield: true
        });

        await new Promise(r => setTimeout(r, 300));
      }

      return true;

    } catch (err) {
      console.error("Erro ao executar hiroshima:", err);
      return true;
    }
  }

  if (cmdName === `${prefix}nagasaki`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const metadata = await sock.groupMetadata(from);
      const participants = metadata?.participants || [];

      await sock.sendMessage(from, {
        text: `O CORNO DO ${formatMentionTag(overrideJid)} TA PUTO`,
        mentions: normalizeMentionArray([overrideJid]),
      });

      await new Promise(r => setTimeout(r, 1000));

      await sock.sendMessage(from, {
        text: `GERAL CALADO POR 3 MINUTOS KKKKKKKKKKK`,
      });

      const mutedUsers = storage.getMutedUsers() || {};
      if (!mutedUsers[from]) mutedUsers[from] = {};

      const now = Date.now();
      const duration = 3 * 60 * 1000;

      for (const participant of participants) {
        const jid = participant?.id;
        if (!jid || jid === sock.user?.id) continue;

        mutedUsers[from][jid] = now + duration;
      }

      storage.setMutedUsers(mutedUsers);

      return true;

    } catch (err) {
      console.error("Erro ao executar nagasaki:", err);
      return true;
    }
  }

  if (cmdName === `${prefix}chernobyl`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const metadata = await sock.groupMetadata(from);
      const participants = metadata?.participants || [];

      const targets = participants.filter(p => p?.id && p.id !== sock.user?.id);

      if (targets.length < 2) return true;

      await sock.sendMessage(from, {
        text: `O CORNO DO ${formatMentionTag(overrideJid)} TA PUTO`,
        mentions: normalizeMentionArray([overrideJid]),
      });

      await new Promise(r => setTimeout(r, 1000));

      await sock.sendMessage(from, {
        text: `CHERNOBYL ATIVADO!`,
      });

      const shuffled = [...targets].sort(() => 0.5 - Math.random());
      const half = Math.ceil(shuffled.length / 2);

      const mutedHalf = shuffled.slice(0, half);
      const punishedHalf = shuffled.slice(half);

      const mutedUsers = storage.getMutedUsers() || {};
      if (!mutedUsers[from]) mutedUsers[from] = {};

      const now = Date.now();
      const duration = 3 * 60 * 1000;

      for (const p of mutedHalf) {
        mutedUsers[from][p.id] = now + duration;
      }

      for (const p of punishedHalf) {
        const punishment = getRandomPunishmentChoice();

        await applyPunishment(sock, from, p.id, punishment, {
          origin: "weapon",
          ignoreShield: true
        });

        await new Promise(r => setTimeout(r, 300));
      }

      storage.setMutedUsers(mutedUsers);

      return true;

    } catch (err) {
      console.error("Erro ao executar chernobyl:", err);
      return true;
    }
  }

  if (cmdName === `${prefix}removerradiacao`) {
    if (!isOverrideSender) {
      await sock.sendMessage(from, {
        text: "❌ Apenas overrides podem usar essa arma!",
      });
      return true;
    }

    try {
      const mutedUsers = storage.getMutedUsers() || {};

      mutedUsers[from] = {};
      storage.setMutedUsers(mutedUsers);

      await clearAllPunishmentsFromGroup(from);

      await sock.sendMessage(from, {
        text: "☢️ RADIAÇÃO REMOVIDA! Tudo voltou ao normal (eu acho).",
      });

      return true;

    } catch (err) {
      console.error("Erro ao executar removerradiacao:", err);
      return true;
    }
  }

  return false;
}

module.exports = { handleWeaponsCommand };
