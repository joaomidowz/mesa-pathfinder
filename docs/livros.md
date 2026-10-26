# Livros da mesa

Desde 26/10/2026 a mesa tem 9 livros. O cadastro único é `scripts/livros.mjs`, e dele leem a extração de texto, as páginas renderizadas, o catálogo de regras e o Worker. Os PDFs, o texto extraído, as páginas e o banco são material licenciado e ficam fora do git (`/books`, `data/*.json`, `data/*.db` no `.gitignore`).

| Livro | id | Siglas da mesa | Quem vê | Edição | Páginas |
| --- | --- | --- | --- | --- | --- |
| Livro do Jogador 1 | `livro1` | (nenhuma), LJ1 | todos | Remaster | 469 |
| Livro do Jogador 2 | `livro2` | LJ, L2 | todos | Remaster | 322 |
| Arquivos Ocultos | `ocultos` | A, AO | todos | Remaster | 225 |
| Fúria dos Elementos | `elementos` | F, FR | todos | Remaster | 242 |
| Pólvora e Engrenagens | `polvora` | PE | todos | legado | 238 |
| Livro do Mestre | `mestre` | LM | só o mestre | Remaster | 341 |
| Bestiário 1 | `bestiario1` | B, B1 | só o mestre | legado | 361 |
| Bestiário 2 | `bestiario2` | B2 | só o mestre | legado | 321 |
| Monstros dos Mitos | `mitos` | MT | só o mestre | legado | 129 |

- **Quem vê:** livro do mestre só aparece para o papel de mestre: busca, entradas, páginas e lista de livros. O administrador é jogador e não vê. A regra fica no Worker ([servidor-da-mesa.md](servidor-da-mesa.md)).
- **Legado:** as entradas desses livros passam pela adaptação ao Remaster ([remaster.md](remaster.md)). Saem com o selo "Legado · adaptado ao Remaster" e com a lista do que mudou. O texto das páginas fica como no livro.
- **Páginas em imagem (`pageImages`):** só os dois Livros do Jogador e o Arquivos Ocultos têm as páginas no volume. Cada livro pesa ~100 MB em imagem, e o volume do Railway tem limite. Os outros ficam **só referenciados**: regra completa e texto das páginas na busca, e no lugar de "Ver no livro" a referência "Bestiário 1, p. 10", para abrir no seu PDF. O leitor lista só os livros com imagem, e o servidor não entrega imagem de livro sem `pageImages`, nem as 144 páginas do FR que subiram pela metade em 26/10.
- **Siglas:** são as que a mesa usa nas fichas para citar de onde veio algo ("Expansão de Truque Mágico — livro A, p. 24"). O filtro de livro da busca aceita a sigla.

## Acrescentar um livro

1. Copie o PDF para `books/<id>.pdf`. Um link para o arquivo também serve.
2. Inclua o livro em `LIVROS`, com:
   - `pdfOffset`: quantas páginas do PDF vêm antes da página impressa 1;
   - `pages`;
   - `audience`;
   - `legacy`;
   - `aliases`.
3. Rode `npm run extract`, depois `npm run render:pages`, depois `npm run parse`. A renderização pula livro já renderizado; os 7 novos levaram 9 minutos e ~720 MB.
4. Confira `data/srd-report.md`, que traz contagens por livro e tipo e o que parece fora do normal.

## Marca d'água do comprador

Os PDFs trazem "Licenciado para Nome, e-mail" em toda página, **grudado no texto** (o e-mail cola na palavra seguinte). `scripts/watermark.mjs` acha o par nome/e-mail de cada livro e o tira de qualquer posição. A extração **para sem gravar** se sobrar "Licenciado para", e-mail que não seja da editora ou o nome do comprador. Sem isso, nome e e-mail iriam para a busca, que a mesa toda lê. A limpeza antiga, que apagava a linha inteira, também levava junto o texto grudado nela. Nos dois Livros do Jogador, isso devolveu uma linha curta em uma página de cada, sem mudar nenhuma entrada.

## O que o catálogo traz dos livros novos

Os dois Livros do Jogador seguem pelo caminho original do `parse-srd.mjs`, intocado. Os ids das entradas deles não mudaram: as fichas guardam esses ids, e a conferência de 26/10 bateu as 2.800 entradas, uma a uma. Os demais livros passam por `scripts/srd-books.mjs`, com estes cabeçalhos:

| Cabeçalho no livro | Tipo |
| --- | --- |
| CRIATURA | `creature` |
| PERIGO, OBSTÁCULO | `hazard` |
| MALDIÇÃO, DOENÇA | `affliction` (categoria `maldição`/`doença`) |
| VEÍCULO | `vehicle` |
| ITEM, MATERIAL, RUNA, ARAPUCA | `item` |
| MAGIA, TRUQUE, TRUQUE MÁGICO | `spell` |
| FOCO | `focus` |
| RITUAL | `ritual` |
| TALENTO | `feat` |

Em 26/10 foram 2.551 entradas: 861 criaturas, 68 perigos, 45 aflições, 45 veículos, 661 itens, 158 magias, 34 de foco, 23 rituais, 651 talentos e 5 classes.

- **Classes novas** (cartão de nível): Psíquico e Taumaturgo (AO), Cineticista (FR), Inventor e Pistoleiro (PE), cada uma com PV, atributo-chave e progressão 1–20. Os talentos delas ganham a categoria `classe: <Classe>`. Também há categorias para Autômato, Ardande, Talos, desviante e consequência.
- **Bloco de estatísticas:** criatura, perigo, aflição e veículo guardam o bloco como texto, uma linha por campo. Rótulos colados pelo PDF são acertados ("PV70" → "PV 70", "For+10,Des+9" → "For +10, Des +9"). A apresentação que vem antes do bloco no livro vai para `description` da própria criatura.
- **Corte do corpo:** o corpo vai do cabeçalho até o próximo, com até 2 páginas depois da do cabeçalho. Ele corta no título em maiúsculas da próxima entrada ou num título sem bloco depois. Título com bloco depois é quadro lateral no meio da leitura, e o corpo continua.
- **Mobília de página:** cabeçalho corrido, abas e número de página saem. A linha que se repete em 35%+ das páginas do livro sai sempre; a que se repete em 8%–35% sai só em bloco de 3+ linhas seguidas.

### Limites conhecidos (26/10)

- **B1:** 2 criaturas (Dragão de Ouro Adulto e Hidra) saem com o bloco incompleto, porque um quadro lateral cortou a leitura. O "Ver no livro" mostra a página.
- **AO:** 27 das 31 "criaturas" são fichas resumidas de aventura que remetem a outro livro ("Javali (Livro dos monstros…)"). Saem como estão.
- **Talentos:** 16 talentos dos livros novos ficam sem categoria.
- **Itens:** 61 itens ficam sem preço, quase todos amaldiçoados do AO, que não têm preço no livro.

## Publicar livros novos

O volume do Railway guarda as páginas (`/data/books/<id>/pages/*.jpg`) e o banco. Para levar um livro novo:

1. Só se o livro tiver `pageImages: true`: suba as páginas com `railway volume files --volume mesa-pathfinder-volume upload books/rendered/<id> /books/<id>`.
2. Suba o texto: `railway volume files upload data/pages.json /pages.json`. A cada subida, o `preparar.mjs` remonta o catálogo a partir dele. Ele troca só as tabelas `srd_*`, numa transação, sem tocar em fichas, membros nem acessos. Se a montagem falhar, o servidor sobe com o catálogo anterior.
3. Publique o código (`railway up --ci`) para o Worker conhecer o livro.
