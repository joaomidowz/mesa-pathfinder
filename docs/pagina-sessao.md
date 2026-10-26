# Página do personagem

`sessao.html?character=<id>` é a ficha inteira, organizada pelo que se quer fazer. Tem um topo fixo e cinco abas: **Combate**, **Habilidades**, **Evoluir**, **Itens** e **Ficha**. No celular as abas ficam numa barra fixa embaixo, ao alcance do polegar; no computador, no topo. Os cartões da Mesa e do Grupo abrem aqui.

Os links antigos continuam valendo: `index.html` e `anotacoes.html` levam à aba Ficha, `progressao.html` à aba Evoluir, e o endereço `#pesquisa` abre Habilidades.

Arquivos: `dist/sessao.html`, `dist/sessao.css`, `dist/sessao.js` e as contas puras em `dist/ficha-calc.js` (`window.FichaCalc`, testadas em `scripts/test-ficha-calc.mjs`). A página carrega `app.js` primeiro e desenha tudo no evento `mesa:ficha`. O contrato está em `docs/modelo-da-ficha.md`.

## Salvar

Desde 26/10/2026, digitar ou tocar nos botões **não envia nada**: a ficha fica marcada como não salva (o botão **Salvar** do topo fica dourado) e a cópia no aparelho é gravada com folga de 1,5 s.

A ficha vai para a nuvem em dois casos:

- no botão **Salvar** do topo, que mostra o estado: Salvar, Salvando…, Salvo ou Tentar de novo;
- sozinha, quando a página perde o foco: troca de aba ou de app, tela bloqueada ou saída da página (`blur`, `visibilitychange`, `pagehide` com `keepalive`).

Sair pelo menu também salva antes. Se algo ficar sem salvar (sem rede, por exemplo), a cópia do aparelho oferece restaurar na próxima abertura.

O motivo: salvar a cada pausa e redesenhar o topo a cada tecla travava o celular em textos longos. Agora a digitação nas anotações não redesenha nada, e o resto redesenha no máximo uma vez por quadro, só as partes ligadas ao campo.

## Topo fixo

- Nome, "Classe N · Ancestralidade" e o botão **Salvar**.
- A faixa com PV, temporários, CA total, as 4 caveiras de Morrendo e Ferido; tocar nela abre o Combate.
- O aviso de status só aparece quando há algo a dizer (não salvo, erro, conflito).

A aba aberta vai no endereço (`#combate`, `#habilidades`, `#evoluir`, `#itens`, `#ficha`); sem ele, volta a última usada no aparelho e, na primeira vez, o Combate.

## Combate (batalhar)

- **Linha de cima: PV · CA · Escudo · Percepção.** No computador é uma linha só; no celular, o PV ocupa a largura e os outros três ficam lado a lado.
- **PV:** Dano gasta os temporários primeiro; Cura para no máximo; Temp. fica com o maior valor; temporários com − e +.
- **CA total** = CA da ficha + escudo (erguido e inteiro) + CA adicional (− e +).
- **Escudo:** tocar ergue ou abaixa; PV do escudo, Dureza e LQ; quebrado ou destruído não soma.
- **Estado:** 4 caveiras de Morrendo (as acima de 4 − Condenado são fatais), Ferido, Heroísmo e Sorte. Cair a 0 PV marca Morrendo sozinho, pela regra do livro.
- **Condições, golpes** (com o 1º, 2º e 3º ataque) e **Editar armas e ataques** logo abaixo, recolhido.
- **Magias em uso** (ataque, CD, espaços, foco, Descanso diário), salvamentos e atributos, e perícias.

## Habilidades (consultar)

- **Buscar regra:** magias, talentos, condições e itens dos dois livros; páginas dos livros e a busca completa abrem em outra aba.
- **Talentos e habilidades:** as Escolhas e as habilidades e ações; tocar abre a regra.
- **Magias** e **Perícias**, para ler.
- **Editar habilidades e ações**, recolhido.

A busca funciona também na visão do mestre.

## Evoluir (subir de nível)

- **Cartão de nível:** o nível com **− / Subir para o nível N+1** (o único lugar onde o nível muda) e, pela tabela da classe no catálogo, o que o nível dá:
  - cada vaga de talento (classe, perícia, geral, ancestralidade) com **Escolher**, que abre a lista já filtrada, ou com ✓ e o nome quando já foi escolhida;
  - **Incremento de perícia** e **Melhorias de atributo**, com atalho para Perícias e Atributos;
  - as características da classe naquele nível;
  - **PV do nível** (PV da classe + Constituição) com **Somar**, que soma no máximo e nos atuais todos os níveis que faltam ("Somar +24 dos níveis 3 e 4"). O botão só aparece acima do nível até onde os PV já foram contados: fichas convertidas já trazem os PV do nível que têm. O **−** desfaz só o que o Somar pôs naquele nível;
  - uma linha com o que vem no próximo nível.

  Classe fora dos livros mostra um aviso para conferir no próprio livro.
- **Experiência:** XP com +10, +30, +40, +80 e +120.
- **Escolhas:** talentos por nível, com **Trocar**, ×, o selo "fora dos livros" e **+ Escolha** (vaga e nível); características de ancestralidade e herança.
- **Atributos e defesas**, **Defesa** (a conta da CA como na ficha oficial, com **Usar**, proficiências de armadura, escudo, **Preencher pelos equipados**), **Perícias** (valores com Explicar) e **Magias** (conjuração e a lista, com **+ Magia**).

## Itens

- **Inventário:** abas Carregável, Consumíveis e Equipados; tabela com quantidade [−][+] e Volume; **+ Item**; a janela do item tem nome, aba, investido, notas e **Ligar ao catálogo**. Volume total com os limites pela Força.
- **Riqueza** em PL, PO, PP e PC, e o texto antigo do inventário, recolhido.

## Ficha

Identidade (com sugestões de classe, ancestralidade e herança dos livros), Anotações (com o Caderno de referências) e Backup (baixar e importar).

## Escolhas justas

Cada vaga busca só nas categorias certas, até o menor entre o nível da vaga e o do personagem (`/api/search` com `category` e `maxLevel`):

| Vaga | Categorias |
| --- | --- |
| Talento de classe | `classe: <Classe>` |
| Talento de ancestralidade | `ancestralidade: <Ancestralidade>` e `herança versátil: <Herança>` |
| Talento de perícia, Talento da biografia (nível 1) | `geral | perícia` |
| Talento geral | `geral` (inclui os de perícia, como no livro) |
| Arquétipo | `arquétipo` |

O que não está nos livros entra à mão com o selo **fora dos livros**, que o mestre vê.

## Fichas antigas

Na primeira abertura pelo dono, a ficha é convertida e salva (`sheetVersion: '2'`): o inventário em texto vira linhas da tabela, as moedas saem da Riqueza e os talentos de `feats.*` viram Escolhas ligadas ao catálogo. Nada é apagado: o texto antigo fica no fim de Itens. As regras estão em `docs/modelo-da-ficha.md`.

## Como a página evita travar e perder o foco

- Os campos editáveis são fixos no HTML, com `data-bind`; o `app.js` os liga e grava, sem varrer a página a cada tecla.
- O `sessao.js` desenha as partes de exibição pelo `setHtml`, que só troca o HTML quando ele mudou; uma mesma parte pode aparecer em duas abas (`out(seletor)`).
- Um ouvinte de `input` junta as partes ligadas ao campo (`PATH_PARTS`) e desenha no próximo quadro. Anotações não redesenham nada.
- O topo fixo não usa `backdrop-filter`: o desfoque repintado a cada tecla pesava no celular.
- Os contadores do Combate são botões com `<output>`. Tocar num botão solta o campo em foco, para ele mostrar o valor novo.

## Modo leitura

Quando o mestre abre a ficha de outro jogador, `Mesa.readOnly()` é verdadeiro. Tudo continua visível e as regras abrem, mas os controles que alteram a ficha somem (`[data-mutate]`) ou ficam travados, inclusive o Salvar e o Subir de nível. A busca continua livre (`data-free`). A conversão de uma ficha antiga vale só na tela dele.

## Conferência

`npm test` cobre as contas (`test-ficha-calc.mjs`, incluindo `levelGains` e `hpGain`) e a busca (`test-worker.mjs`). A tela é conferida numa prévia com uma cópia do banco real, em 390 px, 360 px e 1366 px.
