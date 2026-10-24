# Página Sessão

`sessao.html?character=<id>` é a ficha para usar durante o jogo: tudo à vista no celular e a regra a um toque. O cartão do personagem na Mesa abre aqui; a ficha de edição completa continua em **Ficha**, **Progressão** e **Anotações**.

Arquivos: `dist/sessao.html`, `dist/sessao.css`, `dist/sessao.js` e as contas puras em `dist/ficha-calc.js` (`window.FichaCalc`, compartilhado com o painel do grupo e testado em `scripts/test-ficha-calc.mjs`). A página carrega `app.js` primeiro e desenha tudo no evento `mesa:ficha` (contrato em `docs/modelo-da-ficha.md`).

## O que aparece e onde grava

| Seção | Mostra | Controles e campo gravado |
| --- | --- | --- |
| Cabeçalho | nome, ancestralidade e herança, classe e nível, biografia, jogador, estado do salvamento | — |
| Vitais | PV atual/máximo com barra (cheios, com dano, em perigo ≤ 25%, 0 PV), temporários, CA, Percepção, Fortitude, Reflexos, Vontade, deslocamento, CD de classe | **Dano** consome os temporários primeiro e não deixa PV negativo; **Cura** para no máximo; **Temp.** fica com o maior valor (temporários não se somam) → `stats.hpCurrent`, `stats.hpTemp`. Heroísmo (3 marcadores) → `heroPoints` |
| Condições | chips com valor (Assustado 2) | **+ Condição** busca nas 41 do catálogo; − / + nas que têm valor (chegar a 0 tira a condição); × remove → `conditions` |
| Atributos | modificadores com sinal | — (edição na Ficha) |
| Golpes | 1º, 2º e 3º ataque com a penalidade de ataques múltiplos (−5/−10; −4/−8 com o traço ágil), dano, traços, notas | — (edição na Ficha) |
| Perícias | as 17 em ordem alfabética, apagadas quando ≤ 0 | toque mostra para que serve |
| Magias | tradição e tipo, ataque e CD de magia, espaços por ranque, pontos de foco, magias agrupadas (truques, cada ranque, foco, rituais) | marcadores de espaço e de foco (cheio = disponível); **Descanso diário** libera os espaços e repõe o foco; **Editar** abre tradição, tipo, ataque, CD, foco máximo e máximos por ranque (`data-bind`); **+ Magia** busca no catálogo ou anota à mão → `spellcasting`, `spells` |
| Talentos e habilidades | os talentos de `feats` (o nome antes do " — ") e as habilidades de `abilities` | toque procura a regra no catálogo pelo nome; sem acerto, mostra a anotação e o link do livro já cadastrado |
| Itens | itens com regra, quantidade, volume, investido e volume total; abaixo, o inventário em texto livre | **+ Item** busca no catálogo ou anota à mão; investido liga/desliga; quantidade, volume e notas na janela do item → `items` |

Magias guardam `kind` (`truque`, `magia`, `foco`, `ritual`), tirado do catálogo ao adicionar. Ficha sem esse campo é completada pela página a partir do catálogo e o valor vai junto no próximo salvamento.

## Modo leitura

Quando o mestre abre a ficha de outro jogador, `Mesa.readOnly()` é verdadeiro: tudo continua visível e as regras abrem, mas os controles que alteram a ficha somem (`[data-mutate]`) ou ficam travados (marcadores, investido), e nada chama `Mesa.dirty()`. O servidor recusa a gravação de qualquer forma — esconder é só conforto.

## Conferência

`npm test` cobre as contas (`test-ficha-calc.mjs`). A tela foi conferida na prévia local com o navegador headless em 390 px e 1366 px: leitura e edição, janela de regra, busca no catálogo e gravação ponta a ponta (dano, condição, magia e espaço lidos de volta pela API).
