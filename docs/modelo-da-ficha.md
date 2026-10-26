# Modelo da ficha e contratos entre as páginas

Contrato comum da página do personagem (`sessao.html`, abas Ficha, Combate e Pesquisa), do painel do grupo, do catálogo de itens e do servidor da mesa. Mudou aqui, muda em todos.

## Campos da ficha

A ficha continua sendo um JSON livre validado por `validateData` (`worker/index.mjs`). Os campos abaixo são **aditivos**: fichas antigas não têm nenhum deles e ganham os valores vazios de `DEFAULTS` (`dist/app.js`) ao abrir. Números seguem como texto, igual ao resto da ficha (`stats.ac: '17'`), porque o jogador digita `+7`, `1d6+4` ou deixa em branco.

| Campo | Tipo | Conteúdo |
| --- | --- | --- |
| `profile.level` | texto | Nível de 1 a 20. Na página, só muda pelos botões − e + do topo (não sobe sozinho pelo XP). |
| `profile.xp` | texto | XP atual; as somas aceitam milhar com ponto (`'1.750'` vale 1750). |
| `heroPoints` | texto | Pontos de heroísmo atuais (`'0'` a `'3'`). |
| `luck` | texto | Sorte, de `'0'` sem máximo. |
| `conditions` | lista de objetos | Condições ativas: `{ id, name, value }`. `id` é o da entrada do catálogo (`condition-assustado-livro1`) ou `''`; `value` é o valor numérico da condição (`'2'` em Assustado 2) ou `''` quando ela não tem valor. Morrendo, Ferido, Condenado e Inconsciente usam `condition-morrendo-livro1`, `condition-ferido-livro1`, `condition-condenado-livro1` e `condition-inconsciente-livro1` (Inconsciente sem valor); o Combate cuida delas pela regra do livro. |
| `defense` | objeto | `{ ac: { category, dexCap, item }, armorProf: { unarmored, light, medium, heavy }, shield: { bonus, hardness, hpMax, bt, hp, cover, raised }, acBonus }`. `category` é a armadura usada (`unarmored`, `light`, `medium`, `heavy`); `armorProf` guarda a proficiência em cada uma (`U`, `T`, `E`, `M`, `L`; `''` = não definida); `dexCap` vazio é sem limite; `bt` é o limiar de quebra (LQ); `cover` é o bônus ao Buscar Cobertura do escudo de corpo; `raised` é booleano; `acBonus` é a CA adicional (pode ser negativa). A CA da ficha continua em `stats.ac`: a conta do livro só a troca pelo botão Usar. |
| `inventory.coins` | objeto | `{ pl, po, pp, pc }`, em texto. 1 PL = 10 PO = 100 PP = 1.000 PC; 1.000 moedas contam 1 de Volume. |
| `choices` | lista de objetos | Escolhas de talento: `{ id, name, slot, level, manual, note }`. `slot` ∈ `classe`, `ancestralidade`, `pericia`, `geral`, `arquetipo`, `biografia`; `id` da entrada `feat-…` ou `''`; `manual: true` marca "fora dos livros" (anotada à mão); `note` guarda o texto original de uma escolha convertida. |
| `sheetVersion` | texto | `'2'` depois da conversão das fichas antigas (abaixo). Personagem novo já nasce com `'2'`. Fica fora do `DEFAULTS`. |
| `extra.pvAte` | texto | Nível até onde os PV (classe + Constituição) já estão na ficha. Sem a marca vale o nível atual, porque a ficha convertida já traz os PV. O **Subir** e o **−** gravam a marca antes de mudar o nível; acima dela o cartão de nível oferece o **Somar**, que soma de uma vez todos os níveis que faltam. |
| `extra.pvNiveis` | objeto | `{ '<nível>': '<PV somados>' }`, um por nível somado pelo **Somar**. O **−** desfaz exatamente o que foi somado naquele nível; PV que já estavam na ficha continuam nela e não voltam a ser oferecidos. |
| `spellcasting` | objeto | `{ tradition, kind, attack, dc, slots, focus }`. `tradition`: `arcana`, `divina`, `ocultista`, `primal` ou texto livre. `kind`: `preparado`, `espontâneo` ou `''`. `slots`: `{ '1': { max: '3', used: '1' }, … '10': … }` por nível de magia (ranque). `focus`: `{ max, current }`. |
| `spells` | lista de objetos | `{ id, name, rank, kind, notes }`. `id` da entrada do catálogo (`spell-…`, `focus-…`, `ritual-…`) ou `''` para magia digitada à mão; `rank` é o ranque em que está preparada/conhecida; `kind` é `truque`, `magia`, `foco` ou `ritual` (do catálogo; ausente em fichas antigas, a página Sessão completa). |
| `items` | lista de objetos | `{ id, name, qty, bulk, invested, notes, section }`. `id` da entrada `item-…` do catálogo ou `''`; `invested` é booleano; `section` ∈ `carregavel`, `consumivel`, `equipado` (sem ela, Carregável). `bulk` é o Volume **por unidade**: `'0'`, `'L'` ou um número; `''` aparece como "?" e entra no aviso de itens sem Volume (antes de 24/10/2026 contava 0). O Volume total segue o livro: 10 itens L contam 1, a fração cai; sobrecarregado acima de 5 + Força e máximo 10 + Força. |

O servidor só confere a forma: `spellcasting` e `defense` têm que ser objetos e `spells`, `items`, `choices` e `conditions` têm que ser listas de objetos (HTTP 400 se não forem). O resto é responsabilidade das páginas.

### Conversão das fichas antigas (`sheetVersion: '2'`)

Fichas de antes da página única guardavam o inventário em texto livre (`inventory.carried`, `consumables`, `equipped`, `wealth`) e os talentos em `feats.*`. A página converte na primeira abertura, no navegador, e o salvamento automático grava (as fichas de verdade estão no volume da hospedagem). Na visão do mestre a conversão vale só na tela; com um conflito de versão aberto, nada é salvo por cima.

- **Inventário** (`FichaCalc.migrateInventory`):
  - cada linha das três caixas vira uma linha da tabela, na aba correspondente;
  - "×N" ou um número no começo ("19 virotes") é a quantidade, e o último parêntese é o Volume;
  - "— investido" liga o investido, e o texto depois de " — " vai para as notas;
  - com quantidade maior que 1, só `0` e "nL" com n igual à quantidade viram Volume por unidade; o resto fica "?" com a nota "Volume anotado: …";
  - `(*)` e `(**)` definem recipientes, e quem tem o asterisco ganha a nota "na Mochila".
- **Itens que já existiam em `items`:** casam com as linhas pelo nome (primeiro idêntico, depois por palavras, só quando o par é único) e mantêm `id`, Volume, investido e quantidade.
- **Riqueza:** linhas "PL/PO/PP/PC: número" viram `inventory.coins`; linhas sem número ("PP: confirmar") e as de "Volume…" ficam só no texto; as demais viram itens em Carregável.
- **Escolhas** (`FichaCalc.choicesFromFeats`):
  - `ancestryTalent` → ancestralidade 1, `background` → biografia 1, `class1` → classe 1, `class2` → classe 2, `skill2` → perícia 2, `archetype` → arquétipo 2;
  - depois a página busca o `id` só nas categorias da vaga (`FichaCalc.pickFeat`), porque o mesmo nome existe em classes diferentes;
  - sem acerto, ou citando livro que não é o 1 nem o 2, a escolha fica `manual` com o texto original em `note`;
  - `feats.ancestry` continua como texto (características, não talento).
- **Nada é apagado:** o texto antigo aparece recolhido no fim do Inventário, com o botão "Apagar texto antigo", e os outros `feats.*` e `extra.level*` ficam guardados.

## Ponte com o `app.js`: `window.Mesa` e o evento `mesa:ficha`

Páginas de personagem (`?character=<id>`) carregam `app.js` **antes** do próprio script. O `app.js` busca a ficha, aplica o backup local, liga os campos `data-bind`, cuida do salvamento com versão (no botão Salvar ou quando a página perde o foco) (HTTP 409 em conflito) e, no fim, dispara `document.dispatchEvent(new CustomEvent('mesa:ficha'))`. A página escuta esse evento e então desenha o que é seu.

`window.Mesa` expõe:

- `session`, `character` (com `readOnly` e `version`), `data` (a ficha viva — altere este objeto) e `books`;
- `conflict`: verdadeiro quando há conflito de versão aberto (nesse caso, nada de salvar automaticamente por cima);
- `api(path, method, payload)` para `/api/*`;
- `dirty()`: marca a ficha como não salva e agenda a cópia no aparelho com folga de 1,5 s (respeita `readOnly`). Desde 26/10/2026 **não envia nada**: quem envia é o botão Salvar (`[data-save]`) ou a página perdendo o foco (`blur`, `visibilitychange`, `pagehide`);
- `saveData({ keepalive })`: salva já, se houver algo pendente; `keepalive` é usado na saída da página. O botão Salvar recebe `data-state` (`saved`, `pending`, `saving`, `offline`) e o texto em `[data-save-label]`;
- `bindAll(root)`: liga `data-bind` dentro de `root` (caixas de marcar usam `checked`) e, se a ficha for só leitura, desabilita os campos, menos os marcados com `data-free` (como a Pesquisa);
- `updateCalculations()`: refaz as contas fixas da página (Fúria do bárbaro) depois de mudar nível ou atributos por botão;
- `readOnly()`, `escapeAttr(texto)`, `openHelp(título, texto)` e `skillInfo` (nomes e explicações das perícias).

Em conflito, o rascunho local guarda a versão em que as edições se basearam, para o conflito continuar aparecendo ao recarregar.

Regra de ouro: altere `Mesa.data`, chame `Mesa.dirty()`. Nunca faça `PUT` direto — o `app.js` é o dono da versão da ficha.

## Regras do catálogo: `window.Regras` (`dist/regras.js`)

- `TYPE_LABELS`, `BOOK_NAMES`, `escapeHtml`, `markify`, `metaLine(entrada)`;
- `bodyHtml(entrada)`: corpo da regra (campos do tipo, texto, elevações);
- `detailHtml(entrada, { actions })`: cabeçalho com "Ver no livro", traços e corpo; `actions` acrescenta botões;
- `bookLink(entrada)`.

`reflow(texto)` junta as quebras de linha que vieram das colunas do PDF. `entrada` é a resposta de `GET /api/entries/:id`.

## Contas da ficha: `window.FichaCalc` (`dist/ficha-calc.js`)

Funções puras usadas pela página do personagem e pelo painel do grupo (testes em `scripts/test-ficha-calc.mjs`):

- **Números e textos:** `toInt`, `toCount` (inteiro que entende milhar com ponto: `'1.750'` → 1750), `stepValue` (botões [−][+] com mínimo e máximo), `levelStep` (1 a 20), `formatModifier`, `formatNumber`, `normalizeName`, `displayName` (nomes do catálogo em maiúsculas viram "Bola de Fogo"), `featName`.
- **PV e condições:** `hpState`, `applyDamage`, `applyHealing`, `applyTemp`, `conditionHasValue`, `dyingState` (Morrendo, Ferido, Condenado, Inconsciente, limite de morte), `setConditionValue`, `setDying` (perder Morrendo dá Ferido +1), `afterDamage` e `afterHealing` (a regra do livro ao cair e ao ser curado).
- **Defesa:** `profBonus`, `acFormula` (a conta do livro, só conferência), `shieldState` (erguido, quebrado, destruído), `effectiveAc` (CA total com escudo e CA adicional), `armorFromEntry` e `shieldFromEntry` (números do catálogo; `null` quando a entrada não tem).
- **Golpes e magias:** `mapSequence` (ataques múltiplos), `slotRanks`, `dailyRest`, `spellKind`, `groupSpells`.
- **Inventário:** `normalizeBulk`, `bulkSummary` (Volume do livro, limites pela Força e itens "?"), `coinsTotal`, `parseInventoryLine` e `migrateInventory` (conversão do texto antigo, pura e idempotente).
- **Escolhas:** `choicesFromFeats`, `VERSATILE_HERITAGES`, `matchCatalogName`, `choiceQuery` (vaga → categorias e nível máximo), `pickFeat`.
- **Subir de nível:** `levelGains` (o que a tabela da classe dá num nível, separado em vagas de talento, incremento de perícia, melhorias de atributo e características) e `hpGain` (PV da classe + Constituição).
- **Painel do grupo:** `sortSheets`. Para achar entradas: `GET /api/search?q=&type=&level=&maxLevel=&category=&book=&trait=&limit=` (tipos: `spell`, `focus`, `ritual`, `feat`, `class`, `ancestry`, `condition`, `item`). `level` é exato e `maxLevel` é "até este nível"; `category` pode vir até 3 vezes, valendo qualquer uma (é assim que a vaga de ancestralidade junta `ancestralidade: Humano` e `herança versátil: Cambiante`); `limit` vai até 200.

## Painel do grupo: `GET /api/party`

Qualquer membro ativo. Devolve `{ characters: [...] }` com as fichas dos membros ativos de papel Jogador e, para quem chama, também as próprias (é assim que o mestre recebe as dele, de criaturas e NPCs). Cada item: `{ id, name, owned, version, updatedAt, data }`, mais `ownerEmail` só quando quem chama é mestre e a ficha não é dele. `data` é um recorte da ficha, com os valores sempre em texto:

- `profile`: `name`, `player`, `level`, `className`, `ancestry`;
- `stats`: `hpMax`, `hpCurrent`, `hpTemp`, `ac`, `perception`, `fort`, `reflex`, `will`, `classDc`;
- `spellcasting`: só `dc`; `heroPoints`; `conditions`: `[{ name, value }]`.

Nada além disso sai: anotações, inventário, itens, magias e espaços ficam só em `/api/characters/:id`, com as regras de sempre.

## Servidor da mesa: rotas `/auth/*`

Só existem no servidor da mesa (`server.mjs` em modo mesa). Nele, `GET /api/session` devolve `invitationMode: 'access-code'` (ou `'email'` com `MESA_LOGIN=email`), e o `app.js` mostra o botão Sair e a geração de links de acesso (no modo e-mail, o **Link de entrada** `/entrar.html#<e-mail>`, montado na própria tela).

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /auth/login` | qualquer um | `{ code }` ou, com `MESA_LOGIN=email`, `{ email }` | 200 `{ ok: true }` e cookie de sessão; 401 `{ error }` com código errado, e-mail fora da mesa ou o e-mail do administrador (que entra só com código); 403 para quem foi revogado; 400 para `{ email }` no modo código. |
| `POST /auth/logout` | qualquer um | — | 200 `{ ok: true }` e cookie apagado. |
| `POST /auth/code` | só o administrador (`TABLE_OWNER_EMAIL`) | `{ email }` | 200 `{ email, code, link }`: código novo, que derruba as sessões antigas da pessoa; 403 para quem não é administrador; 404 se o e-mail não for membro ativo; 400 para o próprio administrador (o código dele vem de `MESA_CODIGO_ADMIN`). |
| `GET /signin-with-chatgpt?return_to=` | qualquer um | — | 302 para `/entrar.html?return_to=…` (o botão Entrar do `app.js` aponta para cá). |

`link` tem a forma `https://<endereço>/entrar.html#<código>`: o fragmento não vai ao servidor e a página de entrada faz o login sozinha.
