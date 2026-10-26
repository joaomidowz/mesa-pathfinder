# Adaptação dos livros legados ao Remaster

Bestiário 1, Bestiário 2, Monstros dos Mitos e Pólvora e Engrenagens são de antes do Remaster (`legacy: true` em `scripts/livros.mjs`). Toda entrada deles passa por `adaptarRemaster` (`scripts/remaster.mjs`) quando o catálogo é montado. A entrada sai com `legacy: true` e com `remaster`, a lista do que mudou. A busca mostra o selo "Legado · adaptado ao Remaster" e essa lista. O texto das páginas e as imagens ficam como no livro: o "Ver no livro" sempre mostra o original.

A base é o quadro "Regras atualizadas" da Fúria dos Elementos. Os termos são os que os livros Remaster em português usam de fato: eversivo, vital, sagrado, profano, espiritual, Golpe Reativo, ranque.

## O que muda

- **Tendência:** sai a sigla da linha de traços (OB, NB, CB, ON, N, CN, OM, NM, CM) e saem os traços BOM/MAU/CAÓTICO/ORDEIRO. ÍNFERO ganha PROFANO, e CELESTIAL ganha SAGRADO.
- **Dano de tendência:**
  - dano "maligno" vira espiritual (profano), e dano "bondoso" vira espiritual (sagrado);
  - dano "caótico"/"ordeiro" vira espiritual;
  - fraquezas, resistências e imunidades a bondoso/maligno viram sagrado/profano;
  - a caótico/ordeiro ficam e entram na lista como sem equivalente.
- **Positivo/negativo:** viram vital/eversivo em energia, dano, cura, traço e defesas. O "Plano de Energia Positiva/Negativa" fica como está e é anotado.
- **Termos renomeados:**
  - Ataque de Oportunidade → Golpe Reativo;
  - "nível de magia" e "magia de 3º nível" → ranque;
  - modificador de habilidade → modificador de atributo;
  - condição lento → desacelerado, como nos Livros do Jogador.
- **Escolas e ativação:**
  - os traços de escola saem, menos ILUSÃO, que continua com regras especiais;
  - na ativação, componentes viram traços quando dá para trocar com segurança (Interagir → manuseio); quando não dá, entram só na lista.

## O que não muda (pendências)

- **Magias renomeadas no Remaster:** os nomes antigos nas listas de magia das criaturas (ex.: "mísseis mágicos") ficam como estão. Não há tabela oficial em português nos livros da mesa, e o mapeamento não é inventado.
- **Planos com nome novo** e **mephits** (agora trastes elementais): ficam anotados, sem troca.
- **Desejo:** virou ritual no Remaster; nas criaturas, segue escrito como magia.

Testes: `scripts/test-remaster.mjs`, só com texto sintético.
