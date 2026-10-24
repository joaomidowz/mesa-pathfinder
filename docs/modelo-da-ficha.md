# Modelo da ficha e contratos entre as páginas

Contrato comum da página Sessão, do painel do grupo, do catálogo de itens e do servidor da mesa. Mudou aqui, muda em todos.

## Campos da ficha

A ficha continua sendo um JSON livre validado por `validateData` (`worker/index.mjs`). Os campos abaixo são **aditivos**: fichas antigas não têm nenhum deles e ganham os valores vazios de `DEFAULTS` (`dist/app.js`) ao abrir. Números seguem como texto, igual ao resto da ficha (`stats.ac: '17'`), porque o jogador digita `+7`, `1d6+4` ou deixa em branco.

| Campo | Tipo | Conteúdo |
| --- | --- | --- |
| `heroPoints` | texto | Pontos de heroísmo atuais (`'0'` a `'3'`). |
| `conditions` | lista de objetos | Condições ativas: `{ id, name, value }`. `id` é o da entrada do catálogo (`condition-assustado-livro1`) ou `''`; `value` é o valor numérico da condição (`'2'` em Assustado 2) ou `''` quando ela não tem valor. |
| `spellcasting` | objeto | `{ tradition, kind, attack, dc, slots, focus }`. `tradition`: `arcana`, `divina`, `ocultista`, `primal` ou texto livre. `kind`: `preparado`, `espontâneo` ou `''`. `slots`: `{ '1': { max: '3', used: '1' }, … '10': … }` por nível de magia (ranque). `focus`: `{ max, current }`. |
| `spells` | lista de objetos | `{ id, name, rank, kind, notes }`. `id` da entrada do catálogo (`spell-…`, `focus-…`, `ritual-…`) ou `''` para magia digitada à mão; `rank` é o ranque em que está preparada/conhecida; `kind` é `truque`, `magia`, `foco` ou `ritual` (do catálogo; ausente em fichas antigas, a página Sessão completa). |
| `items` | lista de objetos | `{ id, name, qty, bulk, invested, notes }`. `id` da entrada `item-…` do catálogo ou `''`; `invested` é booleano. O inventário em texto livre (`inventory.*`) continua existindo e é mostrado à parte. |

O servidor só confere a forma: `spellcasting` tem que ser objeto e `spells`, `items` e `conditions` têm que ser listas de objetos (HTTP 400 se não forem). O resto é responsabilidade das páginas.

## Ponte com o `app.js`: `window.Mesa` e o evento `mesa:ficha`

Páginas de personagem (`?character=<id>`) carregam `app.js` **antes** do próprio script. O `app.js` busca a ficha, aplica o backup local, liga os campos `data-bind`, cuida do salvamento automático com versão (HTTP 409 em conflito) e, no fim, dispara `document.dispatchEvent(new CustomEvent('mesa:ficha'))`. A página escuta esse evento e então desenha o que é seu.

`window.Mesa` expõe:

- `session`, `character` (com `readOnly` e `version`), `data` (a ficha viva — altere este objeto) e `books`;
- `api(path, method, payload)` para `/api/*`;
- `dirty()`: marca alteração e agenda o salvamento automático (respeita `readOnly`);
- `saveData()`: salva já;
- `bindAll(root)`: liga `data-bind` dentro de `root` e desabilita tudo se a ficha for só leitura;
- `readOnly()`, `escapeAttr(texto)`, `openHelp(título, texto)` e `skillInfo` (nomes e explicações das perícias).

Regra de ouro: altere `Mesa.data`, chame `Mesa.dirty()`. Nunca faça `PUT` direto — o `app.js` é o dono da versão da ficha.

## Regras do catálogo: `window.Regras` (`dist/regras.js`)

- `TYPE_LABELS`, `BOOK_NAMES`, `escapeHtml`, `markify`, `metaLine(entrada)`;
- `bodyHtml(entrada)`: corpo da regra (campos do tipo, texto, elevações);
- `detailHtml(entrada, { actions })`: cabeçalho com "Ver no livro", traços e corpo; `actions` acrescenta botões;
- `bookLink(entrada)`.

`reflow(texto)` junta as quebras de linha que vieram das colunas do PDF. `entrada` é a resposta de `GET /api/entries/:id`.

## Contas da ficha: `window.FichaCalc` (`dist/ficha-calc.js`)

Funções puras usadas pela Sessão e pelo painel do grupo (testes em `scripts/test-ficha-calc.mjs`): `formatModifier`, `mapSequence` (ataques múltiplos), `hpState`, `applyDamage`, `applyHealing`, `applyTemp`, `slotRanks`, `dailyRest`, `spellKind`, `groupSpells`, `displayName` (nomes do catálogo em maiúsculas viram "Bola de Fogo"), `featName`, `totalBulk`, `conditionHasValue`, `toInt`, `normalizeName`, `formatNumber`. Para achar entradas: `GET /api/search?q=&type=&level=&book=&trait=&limit=` (tipos: `spell`, `focus`, `ritual`, `feat`, `class`, `ancestry`, `condition`, `item`).

## Servidor da mesa: rotas `/auth/*`

Só existem no servidor da mesa (`server.mjs` em modo mesa). Nele, `GET /api/session` devolve `invitationMode: 'access-code'`, e o `app.js` mostra a geração de links de acesso e o botão Sair.

| Rota | Quem | Corpo | Resposta |
| --- | --- | --- | --- |
| `POST /auth/login` | qualquer um | `{ code }` | 200 `{ ok: true }` e cookie de sessão; 401 `{ error }` com código errado. |
| `POST /auth/logout` | qualquer um | — | 200 `{ ok: true }` e cookie apagado. |
| `POST /auth/code` | só o administrador (`TABLE_OWNER_EMAIL`) | `{ email }` | 200 `{ email, code, link }`: código novo, que derruba as sessões antigas da pessoa; 403 para quem não é administrador; 404 se o e-mail não for membro ativo; 400 para o próprio administrador (o código dele vem de `MESA_CODIGO_ADMIN`). |
| `GET /signin-with-chatgpt?return_to=` | qualquer um | — | 302 para `/entrar.html?return_to=…` (o botão Entrar do `app.js` aponta para cá). |

`link` tem a forma `https://<endereço>/entrar.html#<código>`: o fragmento não vai ao servidor e a página de entrada faz o login sozinha.
