# Página do personagem

`sessao.html?character=<id>` é a ficha inteira, numa página com um topo fixo e três abas: **Ficha**, **Combate** e **Pesquisa**. Os cartões da Mesa e do Grupo abrem aqui. Desde 24/10/2026 `index.html`, `progressao.html` e `anotacoes.html` só redirecionam para a aba Ficha, para os links antigos continuarem valendo.

Arquivos: `dist/sessao.html`, `dist/sessao.css`, `dist/sessao.js` e as contas puras em `dist/ficha-calc.js` (`window.FichaCalc`, testadas em `scripts/test-ficha-calc.mjs`). A página carrega `app.js` primeiro e desenha tudo no evento `mesa:ficha`. O contrato está em `docs/modelo-da-ficha.md`.

## Topo fixo

- Nome, classe e ancestralidade.
- **Nível [−] N [+]**, o único lugar onde o nível muda; não sobe sozinho pelo XP.
- PV com barra e temporários, CA total, as 4 caveiras de Morrendo e Ferido; tocar ali abre o Combate.
- O estado do salvamento (no celular, só quando há algo a avisar) e as abas.

A aba aberta vai no endereço (`#ficha`, `#combate`, `#pesquisa`); sem ela, volta a última usada no aparelho e, na primeira vez, a Ficha.

## Aba Ficha (tudo editável)

| Cartão | O que tem | Grava em |
| --- | --- | --- |
| Progressão | XP com +10, +30, +40, +80 e +120; aceita milhar com ponto ("1.750") | `profile.xp` |
| Identidade | nome, jogador, classe, ancestralidade e herança (com sugestões dos livros), biografia, instinto, divindade, idiomas | `profile.*`, `languages` |
| Atributos e defesas | atributos, PV, CA da ficha, Percepção, salvamentos, velocidade, CD de classe; nota de Fúria | `stats.*` |
| Defesa | conta da CA como na ficha oficial (10 + Des limitada + Prof + Item), proficiências de armadura, escudo, **Preencher pelos equipados** | `defense.*`; `stats.ac` só pelo botão **Usar** |
| Perícias | as 17, com Explicar e referência ao livro (desenhadas pelo `app.js`) | `skills.*` |
| Escolhas | talentos por nível, com vaga, **Trocar**, × e o selo "fora dos livros"; **+ Escolha** com vaga e nível | `choices`, `feats.ancestry` |
| Habilidades e ações, Armas e ataques | listas editáveis do `app.js` | `abilities`, `attacks` |
| Magias | conjuração (tradição, tipo, ataque, CD, foco máximo, espaços por ranque) e a lista, com **+ Magia** | `spellcasting`, `spells` |
| Inventário | abas Carregável, Consumíveis e Equipados; tabela com quantidade [−][+] e Volume; janela do item (nome, aba, investido, notas, **Ligar ao catálogo**); Volume total com os limites pela Força; Riqueza em PL, PO, PP e PC; o texto antigo, recolhido | `items`, `inventory.coins`, `inventory.*` |
| Anotações, Caderno de referências, Backup | os de antes, recolhidos | `notes.*`, `references` |

A conta da CA aparece só com a armadura usada e a proficiência nela escolhidas, e nunca troca a CA sozinha: algumas fichas diferem do livro de propósito ou por engano, e quem decide é o jogador (ou o mestre olhando). Preencher pelos equipados lê, pelo catálogo, a armadura e o escudo ligados na aba Equipados; roupas e itens mágicos sem números no livro ficam à mão.

## Aba Combate (a tela de sessão)

- **Linha de cima: PV · CA · Escudo · Percepção.** No computador é uma linha só; no celular, o PV ocupa a largura e os outros três ficam lado a lado.
- **PV:** Dano gasta os temporários primeiro e não deixa PV negativo; Cura para no máximo; Temp. fica com o maior valor (temporários não se somam). Temporários também com − e +.
- **CA total** = CA da ficha + escudo (só erguido e inteiro) + **CA adicional** (− e +, pode ser negativa). Escudo e cobertura não se somam: a página avisa.
- **Escudo:** tocar ergue ou abaixa; PV do escudo com − e +, Dureza e LQ. Quebrado (PV ≤ LQ) ou destruído (0) não soma e não ergue. Escudo de corpo: +2, com a dica de +4 ao Buscar Cobertura.
- **Morrendo:** 4 caveiras; as que ficam acima do limite (4 − Condenado) aparecem como fatais, e há o estado "Morto". Tocar uma caveira ajusta o valor; descer até 0 é perder Morrendo, e o Ferido sobe 1 (o − do Ferido desfaz). Ao lado: Ferido, Heroísmo (3 marcadores) e **Sorte** (sem limite).
- **Regra do livro automática** (tudo em `conditions`, com os ids do catálogo):
  - dano que tira PV e leva a 0, ou que atinge quem já estava estável em 0: Morrendo 1 + Ferido, e Inconsciente;
  - dano estando com Morrendo: +1;
  - cura de 0 para 1 ou mais estando com Morrendo: tira Morrendo e Inconsciente, e Ferido +1;
  - cura de quem estava estável: só tira Inconsciente.
  - O dano que os temporários absorvem não conta. Crítico (+1 a mais) e dano não letal ficam à mão.
- **O resto:** condições (busca no catálogo, − / + / ×; Morrendo e Ferido têm controle próprio), salvamentos e atributos, golpes com o 1º, 2º e 3º ataque, perícias, magias em uso (ataque e CD, espaços, foco, Descanso diário) e talentos e habilidades, que abrem a regra.

## Aba Pesquisa

Busca no catálogo por nome e tipo. Os resultados abrem a janela da regra; as páginas dos livros e a "Busca completa" abrem em outra aba, sem tirar ninguém da ficha. Funciona também na visão do mestre.

## Escolhas justas

Cada vaga busca só nas categorias certas, até o menor entre o nível da vaga e o do personagem (`/api/search` com `category` e `maxLevel`):

| Vaga | Categorias |
| --- | --- |
| Talento de classe | `classe: <Classe>` |
| Talento de ancestralidade | `ancestralidade: <Ancestralidade>` e `herança versátil: <Herança>` |
| Talento de perícia, Talento da biografia (nível 1) | `geral | perícia` |
| Talento geral | `geral` (inclui os de perícia, como no livro) |
| Arquétipo | `arquétipo` |

Classe e ancestralidade são reconhecidas no texto da Identidade pelos nomes do catálogo e pelas 7 heranças versáteis. Quando não há lista (classe fora dos livros) ou a busca não acha nada, a escolha entra à mão com o selo **fora dos livros**, que o mestre vê.

## Fichas antigas

Na primeira abertura pelo dono, a ficha é convertida e salva (`sheetVersion: '2'`): o inventário em texto vira linhas da tabela, as moedas saem da Riqueza e os talentos de `feats.*` viram Escolhas ligadas ao catálogo. Nada é apagado: o texto antigo fica no fim do Inventário até o dono apagar. As regras estão em `docs/modelo-da-ficha.md`.

## Como a página evita perder o foco

- Os campos editáveis são fixos no HTML, com `data-bind`, e o `app.js` os liga e grava.
- O `sessao.js` só redesenha partes de exibição, uma a uma (`change(mutate, parts)`). A tabela do inventário só é redesenhada ao incluir, tirar ou trocar de aba.
- Um ouvinte de `input` atualiza o topo, a conta da CA e os totais enquanto se digita, sem tocar no campo em foco. Se algo com campo for redesenhado, `keepFocus` devolve o foco e o cursor.
- Os contadores do Combate são botões com `<output>`; não há campo para digitar ali.

## Modo leitura

Quando o mestre abre a ficha de outro jogador, `Mesa.readOnly()` é verdadeiro. Tudo continua visível e as regras abrem, mas os controles que alteram a ficha somem (`[data-mutate]`) ou ficam travados, e nada chama `Mesa.dirty()`. A Pesquisa continua livre (`data-free`). A conversão de uma ficha antiga vale só na tela dele; quem salva é o dono. O servidor recusa a gravação de qualquer forma: esconder é só conforto.

## Conferência

`npm test` cobre as contas (`test-ficha-calc.mjs`) e a busca com `maxLevel` e `category` repetido (`test-worker.mjs`). A tela foi conferida numa prévia com uma cópia do banco real, em 390 px e 1366 px.
