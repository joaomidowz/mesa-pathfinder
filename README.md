# Mesa Pathfinder

Mesa privada de Pathfinder 2e com autorização no servidor. Jogadores veem e editam seus personagens; mestres consultam todos, sem editar fichas alheias. O painel do grupo mostra a todos o resumo de jogo (PV, defesas, condições) de cada personagem. A conta indicada por `TABLE_OWNER_EMAIL` administra os convites e papéis, independentemente de ser jogadora ou mestre.

## O que tem

| Página | Para quê |
| --- | --- |
| `mesa.html` | personagens da conta (o mestre vê todos), convites e papéis; o cartão abre a ficha |
| `sessao.html` | **a ficha do personagem**, organizada pelo que se quer fazer, com topo fixo (botão Salvar, PV, CA, caveiras) e cinco abas (barra embaixo no celular): **Combate** (PV, temporários, CA com escudo, Morrendo, Ferido, Heroísmo, Sorte, condições, golpes, magias em uso), **Habilidades** (busca de regras, talentos, magias e perícias para consultar), **Evoluir** (subir de nível guiado pela tabela da classe, XP, escolhas filtradas pelos livros, atributos, defesa, perícias, magias), **Itens** (inventário em tabela com Volume e riqueza em moedas) e **Ficha** (identidade, anotações, backup). Salva no botão Salvar ou quando a página perde o foco ([docs/pagina-sessao.md](docs/pagina-sessao.md)) |
| `grupo.html` | **painel do grupo**, para todos: PV, CA, Percepção, salvamentos e condições dos personagens da mesa, atualizando sozinho; o mestre vê também as próprias fichas de criaturas e NPCs ([docs/painel-do-grupo.md](docs/painel-do-grupo.md)) |
| `index.html`, `progressao.html`, `anotacoes.html` | redirecionam para a aba Ficha (links antigos) |
| `busca.html` | busca de regras nos 9 livros da mesa; os do mestre só para o mestre (atalho Ctrl+K) |
| `livro.html` | visualizador das páginas dos livros |
| `entrar.html` | entrada por e-mail ou por código de acesso (modo mesa) |

## Rodar

```sh
npm run build          # monta dist/server/index.js (Worker com o frontend embutido)
npm run extract        # texto das páginas de cada livro do cadastro (scripts/livros.mjs), sem a marca d'água, em data/pages.json
npm run render:pages   # gera books/rendered/<livro>/pages (2.648 JPGs via pdftoppm/poppler; pula livro já feito)
npm run parse          # monta o catálogo de regras a partir de data/pages.json (relatório em data/srd-report.md)
npm run dev            # só você: http://127.0.0.1:8787, entra direto como administrador
npm run mesa           # a mesa toda, com login por código ou, com MESA_LOGIN=email, só pelo e-mail (precisa de MESA_CODIGO_ADMIN; npm run codigo gera)
```

O servidor (`server.mjs` + `local/platform.mjs`) roda o mesmo Worker do build com SQLite local e as imagens em disco, e faz o papel que o ChatGPT Sites fazia: login e arquivos. Variáveis, convites, segurança e backups em [docs/servidor-da-mesa.md](docs/servidor-da-mesa.md); a mesa no ar (Railway) em [docs/deploy.md](docs/deploy.md).

## Busca de regras

`busca.html` consulta 5.351 entradas estruturadas — magias, magias de foco, rituais, talentos, classes com progressão 1–20, ancestralidades com heranças, condições, itens, criaturas, perigos, maldições, doenças e veículos ([docs/catalogo-de-itens.md](docs/catalogo-de-itens.md)) — e o texto completo das 2.648 páginas dos 9 livros ([docs/livros.md](docs/livros.md)). Filtros por tipo/nível/livro/traço, detalhe completo com "Ver no livro". API: `/api/search`, `/api/entries/:id`, `/api/srd/stats`. Pipeline: `scripts/extract-text.mjs` (+ `scripts/watermark.mjs`) → `scripts/parse-srd.mjs` (+ `scripts/srd-items.mjs`, `scripts/srd-books.mjs` e `scripts/remaster.mjs`), auditoria em `data/srd-report.md`.

## Dados

- `characters` tem IDs independentes, dono e versão. Atualizações concorrentes recebem HTTP 409; o navegador preserva o rascunho separado por conta e personagem.
- A ficha é um JSON validado pelo Worker; os campos da página do personagem (magias, itens, escolhas, defesa, moedas, condições, conjuração, heroísmo, sorte) são aditivos, e as fichas antigas são convertidas no navegador quando o dono as abre, sem apagar nada ([docs/modelo-da-ficha.md](docs/modelo-da-ficha.md)).
- A tabela antiga `character_sheets` é preservada; a primeira sessão migra a ficha sem apagá-la (`legacy_migrations` impede duplicação). Não alterar migrações aplicadas: `drizzle/` é de produção; as tabelas só do servidor local ficam em `local/migrations/`.
- Livros (`books/`), banco e catálogos extraídos (`data/*.db`, `data/*.json`) são material licenciado ou derivado dele: ficam fora do git e só são servidos a membros ativos; os livros do mestre, só ao mestre. Cadastro, siglas e como acrescentar um livro em [docs/livros.md](docs/livros.md).

## Verificação

```sh
npm test               # monta o Worker e roda todas as suítes scripts/test-*.mjs
```

Banco em memória e identidades sintéticas, sem rede nem porta aberta: Worker (isolamento, papéis, migração, conflitos, busca, campos da ficha), plataforma (login por código e por e-mail, sessão, identidade forjada, origem, arquivos, backup), contas da ficha e catálogo de itens.

## Referências

As páginas digitadas são as impressas; o deslocamento de cada livro no PDF está no cadastro (`scripts/livros.mjs`: Livro 1 +1, Livro 2 +2…). O visualizador usa as páginas renderizadas e não depende do suporte a PDF do navegador mobile.
