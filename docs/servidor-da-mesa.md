# Servidor da mesa

O mesmo Worker do build (`dist/server/index.js`) roda no Node com SQLite local e as páginas dos livros em disco. A plataforma (`local/platform.mjs`) faz o papel que o ChatGPT Sites fazia: serve as páginas, autentica quem entra e repassa a identidade nos cabeçalhos que o Worker já sabe ler. Quem vê o quê continua decidido no Worker, já testado.

## Dois modos

| Comando | Para quê | Login | Escuta em |
| --- | --- | --- | --- |
| `npm run dev` | uso pessoal no próprio computador | nenhum: entra como administrador | só `127.0.0.1` (recusa outro HOST) |
| `npm run mesa` / `npm start` | a mesa toda, na rede ou na hospedagem | código de acesso por pessoa, ou só o e-mail (`MESA_LOGIN=email`) | `0.0.0.0` (ou `HOST`) |

Antes do primeiro uso: `npm run build`, as páginas dos livros (`npm run render:pages`) e o catálogo (`npm run parse`).

## Variáveis (`.env` local ou variáveis da hospedagem)

| Variável | Uso |
| --- | --- |
| `TABLE_OWNER_EMAIL` | e-mail do administrador (padrão `mestre@local`) |
| `MESA_CODIGO_ADMIN` | código de acesso do administrador; obrigatório no modo mesa, 12+ letras ou números. `npm run codigo` gera um |
| `MESA_LOGIN` | `codigo` (padrão: cada pessoa com o seu código) ou `email` (jogadores e mestre entram só com o e-mail cadastrado) |
| `HOST`, `PORT` | endereço e porta (a hospedagem costuma definir `PORT`) |
| `DATA_DIR` | onde ficam `local.db` e `backups/` (padrão `data`) |
| `BOOKS_DIR` | onde estão as páginas renderizadas (padrão `books/rendered`) |

## Convite e entrada

1. O administrador entra com o código de `MESA_CODIGO_ADMIN` (página `/entrar.html`).
2. Em **Personagens → Convites e papéis**, cadastra o e-mail e o papel. A tela gera na hora um **link de acesso** (`/entrar.html#XXXX-XXXX-XXXX`) para copiar e mandar só para aquela pessoa.
3. A pessoa abre o link e já entra; a sessão dura 30 dias naquele aparelho. Em outro aparelho, usa o mesmo link.
4. Perdeu o link? **Novo link de acesso** na lista: o código antigo e todos os aparelhos conectados com ele deixam de funcionar.
5. **Revogar** na lista corta o acesso na hora; as fichas ficam guardadas. **Sair** encerra a sessão do aparelho.

Mudar `MESA_CODIGO_ADMIN` derruba as sessões antigas do administrador.

### Entrada só com o e-mail (`MESA_LOGIN=email`)

Para mesa de amigos, sem código para guardar: quem está cadastrado e ativo em **Convites e papéis** entra digitando o e-mail em `/entrar.html`, ou pelo **link de entrada** (`/entrar.html#nome@email.com`), que a tela mostra ao cadastrar e no botão **Link de entrada** de cada pessoa. O e-mail vai no fragmento do link, que não chega ao servidor, e a página o apaga da barra de endereço.

- O administrador continua entrando só com o código de `MESA_CODIGO_ADMIN`, porque é ele quem convida, troca papéis e revoga.
- No primeiro login o id da conta fica gravado no cadastro, então todos os aparelhos da pessoa caem na mesma conta e na mesma ficha.
- Não há segredo: quem souber o e-mail entra como a pessoa (e vê os livros). Use e-mails que só a mesa conheça; **Revogar** corta o acesso na hora.
- Para voltar aos códigos, troque `MESA_LOGIN` para `codigo` (ou apague a variável) e gere os links de acesso de novo. No modo código, o login por e-mail é recusado.

## O que protege e por quê

- Código com 60 bits (12 símbolos de um alfabeto de 32): adivinhar é inviável, por isso não há limite de tentativas. No modo e-mail essa proteção não existe para jogadores e mestre (veja acima).
- O banco guarda só o `sha256` do código e do token de sessão (`local_access`, `local_sessions`, migração em `local/migrations/` — fora de `drizzle/`, que é de produção).
- Cookie `mesa_sessao` com `HttpOnly`, `SameSite=Lax` e, atrás de https (`x-forwarded-proto`), `Secure`.
- Cabeçalhos de identidade vindos do navegador são sempre descartados; só a plataforma os escreve.
- A URL repassada ao Worker sai do `Host` e do protocolo usados pelo navegador, e as rotas `/auth/*` e o Worker recusam `Origin` de outro site.
- Só os arquivos de primeiro nível de `dist/` com extensão html, js ou css são servidos — o Worker montado e os metadados, não. Páginas dos livros só com sessão.
- Corpo de requisição limitado a 2 MB. Logs sem código, token, cookie nem e-mail (no modo mesa).

## Backup

No modo mesa, ao subir e a cada 24 h, `DATA_DIR/backups/fichas-<data>.json` recebe fichas, membros e o histórico de migração das fichas antigas (sem acessos nem sessões); ficam os 10 mais recentes. Cada ficha também tem **Baixar backup** na própria tela.

## Testes

`scripts/test-platform.mjs` (78 verificações, banco em memória, sem abrir porta): configuração, login por código e por e-mail, cookie, identidade forjada, convite, origem, troca de código, sessão vencida, revogação, arquivos, modo dev e backup.
