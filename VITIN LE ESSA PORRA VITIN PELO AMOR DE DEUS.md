# Vitin-bot-dnv - Auditoria Completa de Convencoes, Naming e Praticas

Data: 2026-04-07
Escopo: repositorio inteiro (runtime, routers, services, games, testes, docs, dashboard, legados)
Tipo: descritivo + prescritivo
Status: referencia de manutencao para contribuir sem quebrar padroes

---

## 0) Objetivo deste documento

Este arquivo consolida os padroes de codigo mais frequentes do projeto e transforma esses padroes em guia pratico de manutencao.

Ele cobre:
- Temas recorrentes de implementacao.
- Convencoes de naming e organizacao.
- Regras de mencao/JID (ponto mais sensivel do projeto).
- Convencao de uso de `ctx` em handlers.
- Padroes de parsing, permissao, persistencia e telemetria.
- Contratos de teste que funcionam como especificacao comportamental.
- Excecoes legadas que NAO devem ser copiadas sem avaliacao.

---

## 1) Mapa de arquitetura e responsabilidades

### 1.1 Runtime principal
- Arquivo central: `bot.js`.
- Papel: casca de transporte e orquestracao.
- Responsabilidades principais:
- bootstrap de auth/sessao Baileys.
- wrapper global de `sock.sendMessage`.
- pipeline de parse/normalizacao de mensagem.
- calculo de contexto e dispatch para routers.
- fila por chat + dedupe + metricas.

### 1.2 Routers por dominio
- `routers/gamesRouter.js`: comandos e fluxo de jogos.
- `routers/economyRouter.js`: economia, inventario, trade, ranking.
- `routers/moderationRouter.js`: moderacao e punicoes administrativas.
- `routers/utilityRouter.js`: utilitarios, menu/help, fluxos auxiliares.
- `routers/weaponsRouter.js`: comandos especiais de override.

### 1.3 Services por dominio
- `services/mentionService.js`: normalizacao de mencoes/JIDs.
- `services/registrationService.js`: identidade, aliases, linkagem.
- `services/economyService.js`: motor economico persistente.
- `services/punishmentService.js`: aplicacao/enforcement de punicoes.
- `services/telemetryService.js`: eventos e metricas.
- services menores especializados (forge, progression, steal, item effects, lootbox etc).

### 1.4 Persistencia
- `storage.js`: estado geral em `.data/state.json`.
- `economyService.js`: economia em `.data/economy.json`.
- Persistencia com debounce e saneamento de estrutura.

### 1.5 Jogos
- Pasta `games/`: modulos de regra (state machine ou handler dedicado).
- Convencao dominante: `start(...)`, acoes intermediarias, `getResults(...)`, `format*`.

### 1.6 Testes
- Framework: Node nativo (`node:test` + `assert/strict`).
- Foco: smoke tests + alguns testes focados por modulo.

---

## 2) Convencoes de linguagem e nomenclatura

### 2.1 Mix de idioma
- Texto para usuario: majoritariamente pt-BR.
- Identificadores de codigo: majoritariamente ingles tecnico (camelCase).
- Nome de alguns comandos e jogos: portugues (com aliases ingleses em alguns casos).

### 2.2 Convencoes de nome de funcao
Padroes recorrentes:
- `normalize*`: canonicalizacao/saneamento (`normalizeMentionJid`, `normalizeUserId`, `normalizeLobbyId`).
- `get*`: leitura/consulta (`getGameState`, `getProfile`, `getMetricsSnapshot`).
- `set*`: escrita/persistencia (`setGameState`, `setMutedUsers`).
- `build*`: composicao de objeto/texto (`buildIntrinsicAliases`, `buildTradeId`, `buildCommandManualPages`).
- `parse*`: parsing robusto (`parseQuotedArgs`, `parseTradeOffer`).
- `extract*`: extracao de substrato (`extractDigits`, `extractMessageText`).
- `is*`: predicado booleano (`isGroup`, `isOverrideSender`, `isDelegatedAdmin`).
- `handle*`: entrypoint de comando/fluxo (`handleGameCommands`, `handleModerationCommands`).
- `apply*`: aplicacao de efeito/regras (`applyMentionSafetyToMessage`, `applyPunishment`).
- `format*`: string de apresentacao (`formatMentionTag`, `formatDuration`).
- `sanitize*`: saneamento de payload/estado (`sanitizeGroupFiltersMap`).

### 2.3 Constantes
- UPPER_SNAKE_CASE para limites e chaves de comportamento.
- Exemplo: `MAX_COIN_OPERATION`, `RR_TURN_TIMEOUT_MS`, `MESSAGE_DEDUPE_TTL_MS`.

### 2.4 Naming de router
- Ponto de entrada tende a seguir `handle<Domain>Commands(ctx)`.
- Retorno esperado: booleano de consumo (`true` handled, `false` nao handled).

---

## 3) Pipeline de mensagem (runtime) - padrao dominante

Fontes principais: `bot.js`, memoria `message_pipeline_reliability_findings_2026-04-05.md`.

### 3.1 Fluxo geral
- Recebe upsert.
- Processa cada mensagem (nao apenas a primeira).
- Faz unwrap de wrappers (ephemeral/viewOnce/etc).
- Extrai texto/contextInfo de forma defensiva.
- Monta contexto normalizado.
- Enfileira por chat para manter ordem local.
- Faz dedupe por chave de mensagem.
- Despacha routers em ordem fixa.

### 3.2 Confiabilidade
- Fila por chat: evita corrida de mensagens no mesmo chat.
- Dedupe com TTL e limite de chaves.
- Guardas para falhas transitivas de metadata.
- Instrumentacao de latencia em estagios criticos.

### 3.3 Regra pratica
- Mudancas no pipeline devem preservar:
- processamento de todas as mensagens do upsert.
- unwrap antes de parse.
- fila por chat.
- dedupe.
- tolerancia a falha de metadata.

---

## 4) Mencoes e JIDs - regra critica do projeto

Fontes principais:
- `services/mentionService.js`
- wrapper global de `sock.sendMessage` em `bot.js`
- uso extensivo em routers/games/services
- memoria `mention_normalization.md`

### 4.1 Regra de ouro
- Texto de exibicao pode usar local part (numero/handle).
- Campo `mentions` deve sempre usar JID normalizado.
- Nunca confiar em JID cru quando for passar para `mentions`.

### 4.2 Primitivas oficiais
- `normalizeMentionJid(value, options)`
- `normalizeMentionArray(rawMentions, options)`
- `getMentionHandleFromJid(jid)`
- `formatMentionTag(jid)`
- `applyMentionSafetyToMessage(messageContent, options)`

### 4.3 Wrapper global de envio
No runtime principal, `sock.sendMessage` eh interceptado para:
- aplicar `applyMentionSafetyToMessage`.
- tentar resolver handles para JIDs reais do grupo via cache/metadata.
- completar `mentions` automaticamente a partir de `@numero` no texto/caption.
- garantir consistencia e dedupe de mentions.

### 4.4 Padrao especifico pedido pelo usuario
Padrao consolidado observado e recomendado:
- Para `text:` usar handle visual com local part, incluindo padrao equivalente a `split("@")[0]`.
- Para `mentions:` SEMPRE passar JID padrao/canonico (normalizado).
- Forma recomendada:
- texto: `formatMentionTag(jid)` ou `@${getMentionHandleFromJid(jid)}`.
- mentions: `normalizeMentionArray([jid])`.

### 4.5 Exemplos corretos
```js
await sock.sendMessage(from, {
  text: `Ola ${formatMentionTag(target)}`,
  mentions: normalizeMentionArray([target]),
})
```

```js
const numero = getMentionHandleFromJid(target)
await sock.sendMessage(from, {
  text: `@${numero} foi sorteado`,
  mentions: normalizeMentionArray([target]),
})
```

### 4.6 Anti-padroes a evitar
- `mentions: [rawValue]` sem normalizar.
- Extrair display com split e reaproveitar esse texto para `mentions`.
- Montar JID manual sem helper quando ja existe utilitario oficial.

### 4.7 Regra de compatibilidade
- Mesmo com wrapper global, continue passando `mentions` corretamente no payload.
- O wrapper eh camada de seguranca, nao desculpa para payload inconsistente.

---

## 5) Convencao de ctx para handlers

### 5.1 Ponto chave
- Handlers de router recebem 1 objeto `ctx` grande e explicitamente injetado.
- Esse padrao evita dependencia escondida e facilita teste/mocks.

### 5.2 Estrutura comum de ctx
Categorias recorrentes:
- transporte: `sock`, `msg`.
- origem: `from`, `sender`, `isGroup`.
- parse: `cmd`, `cmdName`, `cmdArg1`, `cmdArg2`, `mentioned`, `text`.
- auth/permissao: `senderIsAdmin`, `isOverrideSender`, `botHasGroupAdminPrivileges`.
- estado/servicos: `storage`, `economyService`, `gameManager`, `registrationService`.
- helpers de formato/parse/recompensa.

### 5.3 Regras de implementacao
- Sempre destructure no topo do handler.
- Nao acessar variavel global quando dependencia pode vir em ctx.
- Se helper externo for opcional em teste, validar tipo antes de chamar.
- Manter retorno booleano de consumo do comando.

### 5.4 Contrato de retorno
- `true`: comando/fluxo consumido.
- `false`: nao aplicavel, permite proximo handler.

---

## 6) Parsing de comando e dispatch

### 6.1 Padrao de parse
- Normalizar `text` para lower/trim antes de branch principal.
- Separar tokens com `split(/\s+/)`.
- Precomputar `cmdName`, `cmdArg1`, `cmdArg2`, `cmdParts`.

### 6.2 Aliases
- Suporte a aliases e variantes sem acento e com acento.
- Ex.: `comecar/comecar/start`, `memoria/memoria com acento` etc.

### 6.3 Ordem de dispatch no runtime
Ordem efetiva observada:
1. games command
2. games message flow
3. utility
4. economy
5. moderation

### 6.4 Force command
- `!force` cria mensagem sintetica e reusa pipeline unificado.
- Evita fan-out manual e reduz divergencia de comportamento.

---

## 7) Permissao, identidade e override

### 7.1 Calculo de admin efetivo
Padrao dominante:
- admin WhatsApp do grupo
- OU admin delegado em storage
- OU override valido

### 7.2 Identidade override
- Identidade comparada com normalizacao e alias.
- Bloqueios de acao contra override protegido em moderacao.

### 7.3 Regras de guard
- Guardas de permissao cedo (early return).
- Guardas de contexto (grupo vs DM) cedo.
- Mensagens de erro curtas e orientadas ao uso correto.

---

## 8) Persistencia e state management

### 8.1 storage.js
- `stateCache` em memoria + persistencia em `.data/state.json`.
- `saveState` com debounce (padrao 5s) e opcao immediate.
- Serializacao remove `timerId` para nao salvar referencias nao serializaveis.

### 8.2 Padrao get/set
- Metodos por dominio: `getX`, `setX`.
- Muitos getters retornam referencia viva para mapas/objetos.
- Cuidado: mutacao in-place pode vazar entre caminhos.

### 8.3 Saneamento
- Funcoes `sanitize*` para corrigir estrutura antiga/invalida.
- Carregamento pode auto-migrar e salvar novamente quando detecta forma antiga.

### 8.4 Recomendacao operacional
- Sempre revalidar ramo de objeto antes de escrever quando o mesmo estado pode ter sido limpo em outro fluxo.

---

## 9) Registro de usuario e canonicalizacao de identidade

Fonte principal: `services/registrationService.js`.

### 9.1 Cadeia de normalizacao
- `splitDeviceSuffix`
- `parseUserParts`
- `canonicalUserHandle`
- `normalizeIdentityJid`
- `normalizeLegacyUserId`

### 9.2 Alias e linkagem
- `buildIntrinsicAliases` cria conjunto de alias intrinsecos.
- `cache.links` mapeia alias para user canonic.
- Conflito de alias resolvido por `updatedAt` mais recente.

### 9.3 Regra de estabilidade
- Sempre normalizar antes de persistir/consultar.
- Sempre considerar variacoes `@s.whatsapp.net` e `@lid` para identidade da mesma pessoa.

---

## 10) Convencoes de economia

Fonte principal: `services/economyService.js` e `routers/economyRouter.js`.

### 10.1 Limites e clamps
- Operacoes monetarias/item tem limites centrais (max operation, max stack, etc).
- Clamps e parse defensivo sao regra antes de debito/credito.

### 10.2 Estrutura de retorno
Padrao recorrente para acoes:
- `{ ok: true, ... }`
- `{ ok: false, reason: 'motivo' }`

### 10.3 Item system
- Definicoes em catalogo interno com key/id/aliases/name/price/rarity/description.
- Punishment passes seguem formula de chave numerica + parser legacy.

### 10.4 Integracao com telemetria
- Eventos e counters para rastrear uso, falha, comportamento e balanceamento.

---

## 11) Convencoes de jogos

### 11.1 Formato dominante em `games/`
- Modulos exportam objeto com funcoes de estado (start, recordacao, resultados, formatacao).
- Estado do jogo e passado explicitamente.

### 11.2 Excecao importante
- `games/blackjack.js` e `blackjack.js` raiz coexistem; o da raiz segue estilo mais legado.
- Evitar copiar estilo antigo do arquivo raiz quando houver equivalente modular.

### 11.3 Lobbies e apostas
- IDs de lobby normalizados (`normalizeLobbyId`) e controle de timeout/warning.
- Apostas normalmente clampadas entre 1..10 em fluxos de lobby.

### 11.4 Integracao punicao/recompensa
- Jogos chamam callbacks injetados para reward/punishment em vez de acessar tudo globalmente.

---

## 12) Convencoes por router

### 12.1 Games Router
- Handler grande com helpers internos por dominio de jogo.
- Log de fluxo (`[router:games]`) e telemetria por estagio.
- Uso pesado de `normalizeMentionArray` em respostas.

### 12.2 Economy Router
- Alto volume de comandos.
- Parse robusto de argumentos (incluindo tokens com aspas e ofertas de trade).
- Estado de trade/cupom em `storage.getGameState` com chaves dedicadas.

### 12.3 Moderation Router
- Guard clause forte de grupo/permissao.
- Construcoes de identity set para override/protegidos.
- Acoes administrativas com texto de feedback + mention normalizada.

### 12.4 Utility Router
- Grande concentrador de utilitarios e menu/manual.
- Usa identidade publica com fallback (opt-in de mencao, apelido publico, nome registrado).

### 12.5 Weapons Router (outlier)
- Usa `split('@')[0]` para display e `normalizeMentionArray` para mentions, o que esta alinhado com padrao de display vs mention.
- Possui estilo mais antigo em alguns trechos e deve ser tratado como area de padronizacao futura.

---

## 13) Telemetria e observabilidade

Fonte principal: `services/telemetryService.js`.

### 13.1 Estrutura
- Metrics em JSON (`metrics.json`) e eventos diaros em NDJSON.
- Buckets de counter e duration por series key com tags ordenadas.

### 13.2 Enriquecimento
- Enriquecimento de payload/tags com usuario/grupo quando identificavel.
- Resolvers injetaveis para nome conhecido de usuario/grupo.

### 13.3 Padrao de uso
- `incrementCounter` para volume.
- `observeDuration` para tempo.
- `appendEvent` para trilha detalhada.

### 13.4 Recomendacao
- Em novos fluxos criticos, registrar no minimo 1 counter de sucesso/falha e 1 duration quando aplicavel.

---

## 14) Dashboard/web conventions

### 14.1 Backend dashboard
- `routers/dashboardRouter.js` registra rotas JSON e pagina simples/full.
- Toggle por query/env para modo simples.

### 14.2 Frontend dashboard
- JS vanilla, polling de 1s, render incremental em secoes.
- HTML inline no service de pagina com estilo inline.

### 14.3 Regra de manutencao
- Evitar acoplar regras de bot no dashboard.
- Dashboard deve consumir snapshot/telemetria, nao implementar logica de negocio.

---

## 15) Convencoes de testes

Fontes: `tests/*.test.js` e `tests/*.smoke.test.js`.

### 15.1 Stack de teste
- `node:test`
- `assert/strict`
- sem framework de mock externo pesado

### 15.2 Padrao de mock
- `createSockCapture()` recorrente para capturar `sendMessage`.
- storage/economy mocks parciais por teste de router.

### 15.3 Padrao de limpeza
- testes de economia limpam usuarios de teste do arquivo real `.data/economy.json`.
- `test.before` e `test.after` para higiene.

### 15.4 Contratos que os testes reforcam
- retorno booleano de router.
- forma de payload enviado ao socket.
- fallback robusto quando dependencias sao parciais.

### 15.5 Recomendacao de contribuicao
- Para cada comando novo, adicionar smoke test de:
- caminho feliz.
- guarda de permissao/contexto.
- pelo menos 1 erro de input.

---

## 16) Convencoes de documentacao e planejamento

### 16.1 README
- Guia operacional + arquitetura + comandos + observacoes de runtime.
- Linguagem para usuario final em portugues.

### 16.2 commandHelp
- Base declarativa de comandos publicos.
- Estrutura por comando com aliases, usage, commonUsage, details.

### 16.3 Planos em `plans/`
- Arquivos de exploracao/roadmap com detalhamento tecnico.
- Mistura de portugues e ingles tecnico.
- Forte uso de listas de passos e referencias por arquivo.

---

## 17) Outliers e zonas legadas (documentar, nao replicar cegamente)

### 17.1 `AM.js`
- Estilo mais antigo, alta densidade de estado global mutavel.
- Ainda usa utilitarios de mention, mas arquitetura difere do padrao atual de routers + ctx.

### 17.2 `blackjack.js` (raiz)
- Implementacao legado paralela ao blackjack modular em `games/blackjack.js`.
- Estrutura menos alinhada ao modelo de router + state em storage.

### 17.3 Consequencia pratica
- Ao desenvolver funcionalidade nova, preferir padrao moderno (router/service/helpers) em vez de copiar estilo legado de arquivo raiz.

---

## 18) Inconsistencias observadas que pedem padronizacao futura

- Algumas areas ainda usam split/manual em identidade onde helper central seria preferivel.
- Duplicacao de factories de teste (`createSockCapture`) em varios arquivos de teste.
- Mistura de estilos entre modulos legados e modulos novos.
- Uso de logs ad-hoc em parte dos fluxos onde telemetria estruturada poderia substituir.

Diretriz:
- Tratar esses pontos como backlog de padronizacao, nao como regra oficial atual.

---

## 19) Regras prescritivas (MUST / SHOULD / AVOID)

## 19.1 MUST
- M1: Toda mencao em `sock.sendMessage(..., { mentions })` deve passar por `normalizeMentionArray`.
- M2: Display de usuario em texto deve usar `formatMentionTag` ou `getMentionHandleFromJid`.
- M3: Sempre que handler for de router, receber e consumir `ctx` (objeto unico).
- M4: Router deve retornar booleano (`true`/`false`) no contrato de dispatch.
- M5: Identidade de usuario deve ser normalizada antes de ler/gravar economia/registro/punicao.
- M6: Fluxos criticos novos devem ter smoke test minimo com guard + happy path.

## 19.2 SHOULD
- S1: Preferir helper existente de normalize/parse/build em vez de reimplementar string parsing.
- S2: Manter guard clause cedo para permissao, contexto e input invalido.
- S3: Registrar telemetria de sucesso/falha para comandos de alto impacto.
- S4: Em novos comandos, manter texto de uso curto e objetivo.
- S5: Encapsular estado em storage/service em vez de variavel global local.

## 19.3 AVOID
- A1: Nao passar JID cru para `mentions`.
- A2: Nao acoplar logica de negocio ao dashboard/public scripts.
- A3: Nao introduzir dependencia global em router quando pode vir via ctx.
- A4: Nao salvar referencia de timer em estado persistido.
- A5: Nao copiar padrao legado de modulos antigos sem revisar contrato moderno.

---

## 20) Checklist rapido para contribuicoes

### 20.1 Novo comando de router
- Recebe `ctx`.
- Faz guard de contexto/permissao.
- Normaliza argumentos.
- Usa services/storage por injecao.
- Envia resposta com mencoes normalizadas.
- Retorna `true` quando tratado.
- Tem smoke test.

### 20.2 Nova resposta com mencao
- Texto usa handle seguro (`formatMentionTag`/`getMentionHandleFromJid`).
- `mentions` usa `normalizeMentionArray`.
- Nao mistura display token com JID cru.

### 20.3 Novo estado persistido
- Adiciona getter/setter em storage ou service apropriado.
- Define fallback saneado para estado ausente.
- Evita salvar dados nao serializaveis.

### 20.4 Nova feature de economia
- Aplica limites/clamps.
- Retorno padrao `{ ok, reason }` quando aplicavel.
- Loga telemetria minima.
- Adiciona testes para caminho feliz e invalid input.

---

## 21) Referencias concretas de evidencia (amostra representativa)

### 21.1 Mencao/JID
- `services/mentionService.js`: normalizacao de JID/array e `formatMentionTag`.
- `bot.js`: wrapper global de `sock.sendMessage` com mention safety.
- `routers/*`, `games/*`, `services/punishmentService.js`: uso recorrente de `normalizeMentionArray`.
- `routers/weaponsRouter.js`, `bot.js`, `games/caraOuCoroa.js`: local-part para display (`split`/handle).

### 21.2 ctx
- `routers/gamesRouter.js`: `handleGameCommands(ctx)`.
- `routers/utilityRouter.js`: `handleUtilityCommands(ctx)`.
- `routers/moderationRouter.js`: `handleModerationCommands(ctx)`.
- `bot.js`: composicao do ctx e dispatch sequencial.

### 21.3 Persistencia
- `storage.js`: state cache, save debounce, sanitize paths.
- `services/economyService.js`: arquivo separado de economia com limites e schema.

### 21.4 Telemetria
- `services/telemetryService.js`: counters/durations/events com tags enriquecidas.

### 21.5 Testes
- `tests/routers.smoke.test.js`: contrato de retorno/dispatch de routers.
- `tests/games.smoke.test.js`: comportamento de jogos e punicao.
- `tests/economy.smoke.test.js`: fluxos economicos e limites.

---

## 22) Relacao com memorias existentes do repositorio

Este documento amplia e consolida memorias ja registradas:
- `mention_normalization.md`: regra central de normalizacao e confiabilidade de DM.
- `message_pipeline_reliability_findings_2026-04-05.md`: melhorias de pipeline e resiliencia.
- `commands_and_rr_rules.md`: regras de dominio e contratos de comando.
- `editing_notes.md`: riscos praticos de manutencao e cuidado em arquivos sensiveis.

Uso recomendado:
- Tratar este arquivo como mapa principal.
- Usar os 4 arquivos acima como anexos de historico/decisao.

---

## 23) Conclusao operacional

Se um PR novo respeitar os pontos abaixo, ele tende a se integrar sem regressao estrutural:
- mencao/JID no padrao correto (`normalizeMentionArray` + display separado).
- handler em estilo `ctx` com retorno booleano.
- guard clauses de permissao/contexto cedo.
- persistencia por service/storage com fallback saneado.
- cobertura minima em smoke test.

Essa combinacao representa o nucleo de praticas atuais do projeto.
