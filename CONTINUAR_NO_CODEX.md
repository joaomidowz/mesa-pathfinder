# Continuar este projeto no Codex

Este ZIP contém o código da Mesa Pathfinder no commit `3051f0528274e3fff5c00082b77fedc2a759a681`, os dois PDFs originais fornecidos pelo usuário e instruções de continuidade. É uma cópia para trabalhar fora desta conversa; não altera o Site publicado.

## Começar

1. Extraia a pasta `mesa-pathfinder`.
2. Abra a pasta no Codex/VS Code ou rode o Codex CLI nela.
3. Use Node.js 24 ou superior. Não há dependências JavaScript para compilar ou testar este código.
4. Execute `npm run build` e depois `npm test`.

O build gera `dist/server/index.js`, que é um módulo Worker com os HTML, CSS e JS embutidos. Os testes usam SQLite em memória e identidades sintéticas; não acessam produção.

## Prompt pronto para o Codex

> Continue este projeto de fichas Pathfinder para uma mesa com vários jogadores. Leia CONTINUAR_NO_CODEX.md e README.md antes de alterar código. Preserve a ficha original e a privacidade: jogador só consulta/edita seus próprios personagens, mestre consulta todos sem editar fichas alheias, administrador gerencia e-mails e papéis. Use worker/index.mjs como fonte do backend e dist/*.html, dist/app.js, dist/livro.js e dist/styles.css como fontes do frontend; dist/server/index.js é gerado. Rode npm run build e npm test. Primeiro avalie como executar localmente e como manter ou substituir a autenticação e os recursos de hospedagem existentes. Não aceite cabeçalhos de identidade enviados diretamente por clientes em uma implantação fora do Sites. Não apague tabelas nem reaplique migrações existentes sem verificar seu estado. Explique as mudanças necessárias e implemente apenas o que eu pedir a seguir.

## Onde mexer

| Caminho | Função |
| --- | --- |
| `worker/index.mjs` | API, autenticação recebida da plataforma, convites, permissões, leitura dos livros e busca SRD |
| `worker/owner-defaults.json` | Dados-base do personagem original do proprietário; não representa necessariamente sua ficha atual salva |
| `server.mjs` | Servidor local: roda o Worker do build com banco/arquivos locais e login automático de administrador |
| `dist/app.js` | Fichas, mestre, jogadores, administração, referências, salvamento automático, backup e atalho Ctrl+K |
| `dist/mesa.html` | Página de personagens e convites |
| `dist/index.html` | Ficha de um personagem |
| `dist/progressao.html` | Progressão e talentos |
| `dist/anotacoes.html` | Inventário e notas |
| `dist/livro.html` / `dist/livro.js` | Visualizador das páginas |
| `dist/busca.html` / `dist/busca.js` | Busca SRD: catálogos extraídos dos livros com filtros e detalhes |
| `dist/styles.css` | Tema e layout para celular |
| `drizzle/*.sql` | Migrações já usadas em produção; preservar histórico (`0002` cria as tabelas srd_*) |
| `.openai/hosting.json` | Identidade do Site e nomes lógicos dos recursos |
| `scripts/build-worker.mjs` | Monta o Worker e embute o frontend |
| `scripts/test-worker.mjs` | 59 verificações de isolamento, papéis, migração, conflitos e busca SRD |
| `scripts/render-books.py` | Regenera as 791 imagens de páginas a partir dos PDFs incluídos (requer PyMuPDF) |
| `scripts/render-pages.mjs` | Mesmas imagens usando poppler (`pdftoppm`), sem PyMuPDF |
| `scripts/extract-text.mjs` | Extrai o texto das páginas dos dois livros (pdftotext) para `data/pages.json` |
| `scripts/parse-srd.mjs` | Constrói os catálogos (magias, talentos, classes, ancestralidades, condições) e carrega o banco |
| `scripts/local-db.mjs` | Banco local compartilhado (node:sqlite + migrações) e adaptador D1 |

## Servidor local (npm run dev)

O `server.mjs` roda o MESMO Worker do build (`dist/server/index.js`) com ambiente simulado, sem depender do Sites:

- `env.DB` → `data/local.db` (node:sqlite com as migrações drizzle aplicadas);
- `env.BUCKET` → imagens de `books/rendered/` (gere com `npm run render:pages`);
- identidade local fixa de administrador (`TABLE_OWNER_EMAIL` do `.env`, padrão `mestre@local`);
- escuta apenas `127.0.0.1:8787` — nunca exponha os livros publicamente.

Fluxo completo de primeira execução: `npm run build` → `npm run render:pages` → `npm run parse` → `npm run dev`.

## Busca SRD (consulta rápida estilo pf2srd/aonprd)

O pipeline `extract-text.mjs` → `parse-srd.mjs` transforma os PDFs em catálogos estruturados (2557 entradas: 411 magias, 195 magias de foco, 32 rituais, 1846 talentos, 16 classes com progressão 1–20, 16 ancestralidades com heranças, 41 condições), gravados nas tabelas `srd_entries`/`srd_fts` (entradas) e `srd_pages`/`srd_pages_fts` (texto integral das 791 páginas). O relatório `data/srd-report.md` audita a extração; JSONs brutos ficam em `data/*.json`.

- Página: `busca.html` com busca instantânea, filtros (tipo/nível/livro/traço), detalhe completo e botão "Ver no livro"; atalho **Ctrl+K** em qualquer página.
- API: `GET /api/search`, `GET /api/entries/:id`, `GET /api/srd/stats` (mesmas rotas funcionam no deploy do Sites após carregar as tabelas srd_* no D1).
- Nomes com espaços perdidos na extração são recuperados do modo layout; a busca tolera ausência de acentos e espaços (colunas `norm`/`*_norm`).

## O que depende da hospedagem

O código atual foi feito para Cloudflare Workers no Sites. Ele espera:

- `env.DB`: banco D1 com as tabelas das migrações;
- `env.BUCKET`: bucket R2 com imagens de páginas;
- `env.TABLE_OWNER_EMAIL`: e-mail do administrador, configurado no servidor;
- identidade autenticada da plataforma nos cabeçalhos `oai-authenticated-user-id` e `oai-authenticated-user-email`.

Esses recursos e os dados que já estão online NÃO são transferidos automaticamente pelo ZIP. Nenhuma credencial ou token foi incluído. O ID no manifesto não concede acesso ao Site.

Para usar fora do Sites, será preciso configurar hospedagem/banco/arquivos e autenticação real. Servir apenas `dist` com um servidor de arquivos não executa a API e não permite salvar fichas. O backend atual não tem um servidor HTTP local próprio.

Os convites internos cadastram o e-mail e papel, mas o Site privado também exige liberar o visitante em Compartilhar. Não há envio automático de e-mail. Ao migrar para outro provedor, implemente o fluxo de convite conforme o login escolhido.

## Recuperar fichas salvas

As fichas atuais, lista de membros e papéis estão no banco de produção e não constam deste ZIP. Antes de migrar, use **Baixar backup** nas fichas do Site e guarde os JSONs. `worker/owner-defaults.json` é somente o estado-base antigo, não um backup atualizado do banco.

Não exponha uma rota de exportação administrativa sem autenticação. O mestre tem acesso de leitura às fichas, mas jogador não pode obter as de outro jogador.

## Livros e páginas

Os PDFs estão em `books/livro1.pdf` e `books/livro2.pdf`. Para regenerar as imagens:

```sh
python3 -m pip install -r requirements-books.txt
python3 scripts/render-books.py
```

São gerados 469 JPGs do Livro 1 e 322 do Livro 2 em `books/rendered/`. As chaves esperadas no R2 são `livro1/pages/44.jpg`, `livro2/pages/77.jpg`, etc. Os números são os impressos: Livro 1 tem deslocamento +1 no PDF; Livro 2, +2.

As imagens do R2 não estão duplicadas no ZIP porque podem ser recriadas com os PDFs e o script. Para uma nova hospedagem, importe a pasta gerada no armazenamento usado pelo backend. A rota temporária usada na primeira importação foi removida do Worker; `scripts/upload-books.mjs` é histórico e não funcionará contra a versão atual sem uma implementação segura de importação.

## Cuidados de continuidade

- Preserve a autorização no servidor: ocultar botões não protege dados.
- Preserve a versão por personagem e o HTTP 409 para conflitos entre dispositivos.
- Preserve a separação de backups locais por conta e personagem.
- Não publique os livros nem fichas sem autenticação.
- Em uma nova instalação, aplique as migrações em ordem. Em produção existente, verifique quais já foram aplicadas.
- O frontend não foi verificado com duas contas reais em navegador controlado. Os testes de servidor são automatizados.
