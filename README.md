# Mesa Pathfinder

Mesa privada com autenticação do Sites e autorização no servidor. Jogadores veem e editam seus personagens; mestres consultam todos, sem editar fichas alheias. A conta indicada por `TABLE_OWNER_EMAIL` administra os convites e papéis, independentemente de ser jogadora ou mestre.

## Rodar localmente (uso pessoal)

```sh
npm run build          # gera dist/server/index.js (Worker com frontend embutido)
npm run render:pages   # gera books/rendered/ (791 JPGs via pdftoppm/poppler)
npm run parse          # extrai os catálogos dos PDFs e carrega data/local.db
npm run dev            # http://127.0.0.1:8787 — você entra como administrador
```

O servidor local usa o mesmo Worker do build com SQLite local e imagens em disco; escuta apenas `127.0.0.1`. Para trocar o administrador local, copie `.env.example` para `.env`.

## Busca SRD

`busca.html` oferece consulta rápida (estilo pf2srd/aonprd) aos 2 livros: 2557 entradas estruturadas (magias, magias de foco, rituais, talentos, classes com progressão 1–20, ancestralidades com heranças, condições) e busca de texto completo nas 791 páginas. Filtros por tipo/nível/livro/traço, detalhe completo com "Ver no livro" e atalho Ctrl+K. API: `/api/search`, `/api/entries/:id`, `/api/srd/stats`. Pipeline: `scripts/extract-text.mjs` → `scripts/parse-srd.mjs` (auditoria em `data/srd-report.md`).

## Publicação e dados

- O banco D1 `DB` preserva a tabela antiga `character_sheets`; a primeira sessão migra a ficha sem apagá-la. O marcador `legacy_migrations` impede duplicações. Não alterar migrations aplicadas.
- `characters` possui IDs independentes, dono e versão. Atualizações concorrentes recebem HTTP 409; o navegador preserva o rascunho separado por conta e personagem.
- `BUCKET` guarda páginas JPG renderizadas dos PDFs fornecidos. As rotas de leitura exigem membro ativo.
- A rota transitória de importação dos livros foi removida do código após conferir as 791 páginas no R2. `BOOK_UPLOAD_TOKEN` foi removido das configurações. A aplicação não aceita escrita nos livros durante a operação normal.
- Novos convites precisam de cadastro em `Convites e papéis` **e** liberação de visitante na política privada do Site. O app não envia e-mails nem modifica a política da plataforma.
- Para publicar a busca SRD no Sites, carregue as tabelas `srd_*` (migração `0002`) no D1 e importe os dados do `parse-srd.mjs`.

## Verificação

`node scripts/build-worker.mjs`

`node scripts/test-worker.mjs`

Testes usam SQLite em memória e identidades sintéticas, sem escrever no banco de produção. São 59 verificações: isolamento, papéis, migração, conflitos de edição e busca SRD.

## Referências

As páginas digitadas são as impressas: Livro 1 tem deslocamento +1 no PDF; Livro 2, +2. O visualizador usa as páginas renderizadas e não depende do suporte a PDF do navegador mobile.
