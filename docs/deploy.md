# Hospedagem fixa (sempre no ar)

Desenho para o Railway (onde já roda o cs13a0), mas serve para qualquer hospedagem com Docker e volume persistente.

## Como fica

- **Imagem** (`Dockerfile`): Node 24 com o código e o Worker montado. Livros, banco e texto extraído **não** entram na imagem (`.dockerignore`).
- **Volume** montado em `/data`: `local.db` (fichas, membros, acessos, catálogo), `backups/`, `pages.json` (texto extraído) e `books/livro1/pages/*.jpg`, `books/livro2/pages/*.jpg` (~280 MB no total).
- **Ao subir** (`npm start`): `scripts/preparar.mjs` recria o catálogo de regras a partir de `/data/pages.json` (≈1 s; só as tabelas `srd_*`) e o servidor sobe no modo mesa, com login. HTTPS é do proxy da hospedagem (o cookie ganha `Secure` por `x-forwarded-proto`).

## Variáveis

| Variável | Valor |
| --- | --- |
| `TABLE_OWNER_EMAIL` | e-mail do administrador |
| `MESA_CODIGO_ADMIN` | código do administrador (`npm run codigo`); guardar como segredo |
| `DATA_DIR` | `/data` |
| `BOOKS_DIR` | `/data/books` |
| `PORT` | definido pela hospedagem |

## Passo a passo (Railway CLI)

```sh
railway login                                           # no navegador, uma vez
railway init --name mesa-pathfinder                     # projeto novo
railway add --service mesa-pathfinder \
  --variables "TABLE_OWNER_EMAIL=..." --variables "MESA_CODIGO_ADMIN=..." \
  --variables "DATA_DIR=/data" --variables "BOOKS_DIR=/data/books"   # serviço já com as variáveis
railway volume add --mount-path /data                   # volume persistente no serviço
railway up --detach --service mesa-pathfinder           # 1º deploy (usa o Dockerfile)
railway volume files upload books/rendered /books       # páginas dos livros (uma vez)
railway volume files upload data/pages.json /pages.json  # texto extraído (uma vez; de novo se o parser mudar de fonte)
railway redeploy --service mesa-pathfinder              # sobe de novo e monta o catálogo com o pages.json
railway domain --service mesa-pathfinder                # endereço https *.up.railway.app
```

Sem `pages.json` no volume o site sobe normalmente, só que sem catálogo de regras; sem as páginas, o visualizador avisa "Página ainda não disponível".

Novas versões do código: `railway up --detach`. O catálogo se recria sozinho ao subir.

## Depois do ar

1. Abrir `https://<endereço>/entrar.html#<MESA_CODIGO_ADMIN>` — entra como administrador.
2. Convidar a mesa em **Personagens → Convites e papéis** e mandar a cada um o link gerado.
3. Fichas que ainda estão no ChatGPT Sites: cada jogador usa **Baixar backup** lá e **Importar backup** na Ficha do personagem novo aqui.
4. Backups: ficam em `/data/backups` (10 mais recentes). Para guardar fora: `railway volume files download /backups ./backups-mesa`.

## Custo (tabela do Railway em 23/10/2026)

Hobby: US$ 5/mês com US$ 5 de uso incluídos. Memória US$ 10/GB-mês, CPU US$ 20/vCPU-mês, volume US$ 0,15/GB-mês, saída US$ 0,05/GB. Um servidor Node parado (~0,1 GB de RAM) com ~0,3 GB de volume fica na faixa de US$ 1–2/mês de uso — dentro do crédito, se o resto da conta não o consumir.
