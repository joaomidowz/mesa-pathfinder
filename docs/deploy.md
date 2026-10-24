# Hospedagem fixa (sempre no ar)

No ar desde 24/10/2026 no Railway: projeto `mesa-pathfinder`, serviço `mesa-pathfinder`, ambiente `production`. O endereço (`*.up.railway.app`) sai de `railway domain list`. O desenho serve para qualquer hospedagem com Docker e volume persistente.

## Como fica

- **Imagem** (`Dockerfile`): Node 24 com o código e o Worker montado. Roda `node scripts/preparar.mjs && exec node server.mjs --mesa`, sem o npm residente. Livros, banco e texto extraído **não** entram na imagem (`.dockerignore`), e o `railway up` só envia o que o `.gitignore` deixa (cerca de 60 arquivos, menos de 1 MB).
- **Região** `us-east` (Virgínia, a mais perto do Brasil), 1 réplica: o SQLite não admite duas. Sem "App Sleeping": a mesa fica sempre acordada e o primeiro acesso não espera o servidor subir.
- **Volume** `mesa-pathfinder-volume` (5 GB) em `/data`: `local.db` (fichas, membros, acessos e o catálogo de regras), `backups/` e `books/livro1/pages/*.jpg`, `books/livro2/pages/*.jpg` (cerca de 300 MB no total). Não há `pages.json`: o catálogo já vai dentro do banco, e o `preparar.mjs` só avisa que não o recarregou.
- HTTPS é do proxy do Railway, que preserva o `Host` (a checagem de origem do login funciona) e manda `x-forwarded-proto` (o cookie sai com `Secure`).

**As fichas de verdade vivem no volume.** O `data/local.db` da máquina parou no dia da publicação: não o envie de novo (sobrescreveria o jogo) e não edite fichas na prévia local esperando vê-las no ar.

## Variáveis

| Variável | Valor |
| --- | --- |
| `TABLE_OWNER_EMAIL` | e-mail do administrador |
| `MESA_CODIGO_ADMIN` | código do administrador no ar (`npm run codigo`), diferente do `.env` local; gravar com `--stdin` para não passar pela linha de comando |
| `MESA_LOGIN` | `email`: jogadores e mestre entram só com o e-mail (`codigo` volta ao código por pessoa) |
| `DATA_DIR` | `/data` |
| `BOOKS_DIR` | `/data/books` |
| `PORT` | `8787` (o domínio aponta para ela) |

## Como foi publicado (Railway CLI 5.71)

Os comandos de arquivo do volume só funcionam com um deploy ativo, e o banco não pode ser trocado com o servidor aberto em cima dele. Por isso o primeiro deploy sobe com um banco vazio em `/data/inicial`; o banco de verdade e os livros vão para a raiz do volume; e só então `DATA_DIR` passa a `/data`.

```sh
railway login
railway init --name mesa-pathfinder --workspace "<workspace>"
railway add --service mesa-pathfinder \
  --variables "TABLE_OWNER_EMAIL=..." --variables "MESA_LOGIN=email" --variables "DATA_DIR=/data/inicial" \
  --variables "BOOKS_DIR=/data/books" --variables "PORT=8787"
railway service link mesa-pathfinder
npm run --silent codigo | tr -d '\n' | railway variable set MESA_CODIGO_ADMIN --stdin --skip-deploys
railway scale us-east=1                          # antes do volume: ele nasce na região do serviço
railway volume add --mount-path /data            # sem --service: com ele a CLI 5.71 trava (panic)
railway up --ci                                  # 1º deploy, com o banco vazio em /data/inicial
railway volume files upload <cópia>/local.db /local.db
railway volume files upload books/rendered /books --concurrency 16
railway variable set DATA_DIR=/data --skip-deploys
railway up --ci                                  # sobe de novo, agora com o banco de verdade
railway domain --port 8787
```

A `<cópia>` é um retrato consistente do banco local (funciona com a prévia no ar), sem as sessões e os códigos da máquina:

```sh
mkdir -p /tmp/mesa && node -e "const {DatabaseSync}=require('node:sqlite'); new DatabaseSync('data/local.db',{readOnly:true}).exec(\"VACUUM INTO '/tmp/mesa/local.db'\"); const db=new DatabaseSync('/tmp/mesa/local.db'); db.exec('DELETE FROM local_sessions; DELETE FROM local_access; VACUUM'); db.close()"
```

`/data/inicial` fica sem uso depois da troca. A CLI recusa apagar arquivos a pedido de um agente: quem apaga é uma pessoa, com `railway volume files delete`.

## Atualizar o código

`railway up --ci` na pasta principal, com a `main` em dia. O volume não muda. Como ele só monta em um contêiner por vez, a mesa sai do ar por alguns segundos na troca. Mudar uma variável (`railway variable set`) também publica de novo.

## Depois do ar

1. Administrador: `https://<endereço>/entrar.html#<MESA_CODIGO_ADMIN>`.
2. Jogadores e mestre: `https://<endereço>/entrar.html#<e-mail>` entra sozinho; também dá para digitar o e-mail em `/entrar.html`. Pessoa nova: o administrador cadastra em **Personagens → Convites e papéis** e copia o **Link de entrada**.
3. Backups: `/data/backups` guarda os 10 JSON mais recentes das fichas e dos membros (um a cada subida e um a cada 24 h). Para guardar fora: `railway volume files download /backups ./backups-mesa`. Não baixe o `local.db` com o servidor no ar: o arquivo aberto pode vir pela metade.

## Custo

Medido em 24/10/2026: 28 MB de RAM parado, CPU perto de zero e cerca de 400 MB no volume, o que dá uns US$ 0,30–0,50/mês, dentro dos US$ 5 de uso do plano Hobby (a conta toda estimava US$ 3,63 no ciclo). Tabela do Railway: memória US$ 10/GB-mês, CPU US$ 20/vCPU-mês, volume US$ 0,15/GB-mês, saída US$ 0,05/GB. `railway metrics` e `railway usage` mostram os números do momento.
