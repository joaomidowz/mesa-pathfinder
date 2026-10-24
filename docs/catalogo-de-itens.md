# Catálogo de itens

O catálogo SRD ganhou o tipo **item** (243 entradas): aparece na busca (filtro "Itens") e na página Sessão (**+ Item**), com a regra completa a um toque.

| Fonte | O que entra | Quantidade |
| --- | --- | --- |
| Livro 1, capítulo Equipamento (p. 266–295), tabelas no modo layout | armas corpo a corpo e à distância (simples, marciais, avançadas, incomuns), munição, armaduras leves, médias e pesadas, escudos | 98 |
| Livro 2, capítulo Pilha de tesouros (p. 272–311), entradas "NOME ITEM 6+" no modo raw | armaduras, escudos e armas mágicas, couro de dragão, bombas, elixires, mutagênicos, venenos, ferramentas alquímicas, munição mágica, óleos, poções, talismãs, consumíveis, itens segurados e equipados, cajados e varinhas | 145 |

Contagem por categoria e itens suspeitos ficam no fim de `data/srd-report.md`.

## Formato da entrada

`{ type: 'item', name, level, category, traits[], book, page, price, bulk, text }`, mais, quando existem:

- armas: `damage`, `damageType` (perfurante, cortante, contundente), `hands`, `group`, `range` e `reload` (à distância);
- armaduras: `acBonus`, `dexCap`, `checkPenalty`, `speedPenalty`, `strength`, `group`; escudos: `acBonus`, `speedPenalty`, `hardness`, `hitPoints`;
- itens do Livro 2: `usage`, `activate` (resumo da ativação, com os ícones de ação em texto: "(2 ações)"), `variants: [{ name, level, price, text }]` (os "Tipo …; Nível …; Preço …", com a lista de magias dos cajados e varinhas) e `plus` (o item tem versões de nível maior).

O detalhe é desenhado por `Regras.bodyHtml` (`dist/regras.js`).

## Como é extraído (`scripts/srd-items.mjs`)

Funções puras chamadas pelo `scripts/parse-srd.mjs` e testadas em `scripts/test-items.mjs` com texto sintético:

- **Tabelas do Livro 1:** o cabeçalho de cada tabela define o tipo de linha esperado, a categoria e o traço implícito ("incomuns"); cada linha casa com uma expressão por formato (corpo a corpo, à distância, munição, armadura, escudo). Nas páginas ímpares a coluna da barra lateral é cortada; nome que continua na linha de baixo é emendado; "(nível N)" vira o nível do item.
- **Itens do Livro 2:** cada página perde a barra lateral de navegação, o rótulo do capítulo, o rodapé e as legendas de ilustração. O título de seção ("Elixires alquímicos", "Varinhas"…) encerra o item anterior e vira a categoria dos próximos — mas o traço que define o tipo (CAJADO, VARINHA, POÇÃO…) manda quando o título foi lido fora de ordem. Duas correções de coluna: o bloco do topo de uma página vai para o item cujo nome aparece nos tipos dele (senão, segue o fluxo), e página sem cabeçalho de item não continua corpo. O nome e as palavras coladas pelo modo raw recuperam os espaços pelo modo layout, só quando o trecho aparece inteiro numa linha dele.

As saídas de magias, talentos, classes, ancestralidades e condições não mudam com a extração de itens (conferido byte a byte).

## Regenerar

`npm run parse` (precisa de `data/pages.json`; se faltar, `npm run extract` antes, com o poppler instalado).

## Limitações conhecidas

- A tabela de equipamento de aventura do Livro 1 (duas colunas lado a lado) e as arapucas do Livro 2 ainda não entram.
- Mundanos do Livro 1 não trazem descrição, só as estatísticas da tabela.
- Alguns trechos do texto bruto seguem com palavras coladas quando o layout também não ajuda (6 itens com alguma palavra longa colada).
