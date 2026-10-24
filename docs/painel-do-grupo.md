# Painel do grupo

`grupo.html` mostra a mesa toda durante a sessão: PV, defesas e condições de todos os personagens numa tela só. Desde 24/10/2026 é para todos da mesa, não só para o mestre: o link **Grupo** aparece no menu da Mesa e no menu das páginas da ficha.

Arquivos: `dist/grupo.html`, `dist/grupo.css`, `dist/grupo.js` e as contas de `dist/ficha-calc.js` (`hpState`, `formatModifier`, `sortSheets`, testadas em `scripts/test-ficha-calc.mjs`). É uma página independente: não carrega o `app.js` e não grava nada.

## Quem vê o quê

O servidor decide, em `GET /api/party` (`worker/index.mjs`, testado em `scripts/test-worker.mjs`):

- Qualquer pessoa ativa da mesa recebe o **resumo** das fichas de quem tem papel Jogador e está ativo. Quem foi revogado some do painel; a ficha continua guardada.
- As fichas do próprio mestre (criaturas e NPCs) vêm só para ele, na seção **Fichas do mestre**.
- O resumo leva só o que a mesa vê na hora do jogo: nome, jogador, classe, nível, ancestralidade, PV, CA, Percepção, salvamentos, CD de classe, CD de magia, condições e heroísmo. Anotações, inventário, itens, magias e o resto da ficha não saem. O e-mail do dono vai só para o mestre.
- A ficha completa continua com as regras de antes (`/api/characters/:id`): o dono edita a sua, o mestre lê todas e os outros jogadores não abrem. Por isso o cartão é link só para o dono e para o mestre.

Sem sessão, a página mostra o botão Entrar.

## O que mostra

- **Jogadores** e, para o mestre, **Fichas do mestre** (seção recolhível, porque ele pode ter até 300).
- Por cartão: nome, classe e nível, jogador; CA; PV atual/máximo com temporários e barra (cheios, com dano, em perigo ≤ 25%, 0 PV — borda vermelha nos dois últimos); Percepção, Fortitude, Reflexos, Vontade, CD de classe e CD de magia (`spellcasting.dc`); condições com valor; pontos de heroísmo.
- Ordem por nome ou por PV mais baixo primeiro (proporção do máximo).

Valores vazios aparecem como "—"; todo texto vindo da ficha é escapado.

## Atualização

A cada 20 segundos, só com a aba visível (e ao voltar para ela), a página faz um pedido ao `/api/party` com o resumo de todos. Sem mudança, nada é redesenhado. Se a rede cair, avisa no topo e mantém os últimos dados na tela. O botão **Atualizar agora** faz a mesma coisa na hora.
