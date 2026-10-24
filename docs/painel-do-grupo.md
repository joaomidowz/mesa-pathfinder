# Painel do grupo

`grupo.html` é a tela do mestre durante a sessão: PV, defesas e condições de todo mundo numa tela só. O link **Grupo** aparece no menu da Mesa só para quem tem papel Mestre.

Arquivos: `dist/grupo.html`, `dist/grupo.css`, `dist/grupo.js` e as contas de `dist/ficha-calc.js` (`hpState`, `formatModifier`, `sortSheets`, testadas em `scripts/test-ficha-calc.mjs`). É uma página independente: não carrega o `app.js` e não grava nada.

## Quem vê

O servidor já decide: só o papel Mestre lê fichas dos outros (`GET /api/characters` e `/api/characters/:id`). A página consulta `/api/session` e, para quem não é mestre, mostra um aviso com o caminho de volta à mesa; sem sessão, mostra o botão Entrar.

## O que mostra

- **Jogadores** (fichas de outras contas) e **Fichas do mestre** (as próprias, para criaturas e NPCs; seção recolhível, porque o mestre pode ter até 300).
- Por cartão: nome, classe e nível, jogador; CA; PV atual/máximo com temporários e barra (cheios, com dano, em perigo ≤ 25%, 0 PV — borda vermelha nos dois últimos); Percepção, Fortitude, Reflexos, Vontade, CD de classe e CD de magia (`spellcasting.dc`); condições com valor; pontos de heroísmo.
- Ordem por nome ou por PV mais baixo primeiro (proporção do máximo).
- O cartão abre a ficha na página Sessão, em modo leitura.

Valores vazios aparecem como "—"; todo texto vindo da ficha é escapado.

## Atualização

A cada 20 segundos, só com a aba visível (e ao voltar para ela), a página busca a lista leve de personagens e baixa de novo apenas as fichas cuja `version` mudou, 4 de cada vez. Sem mudança, nada é redesenhado. Se a rede cair, avisa no topo e mantém os últimos dados na tela. O botão **Atualizar agora** faz a mesma coisa na hora.
