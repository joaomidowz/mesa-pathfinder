# Servidor da mesa para hospedagem com volume persistente (docs/deploy.md).
# A imagem leva só o código: livros, banco e texto extraído vão para o volume (DATA_DIR, BOOKS_DIR).
FROM node:24-slim
WORKDIR /app
COPY . .
RUN node scripts/build-worker.mjs
ENV NODE_ENV=production
# O mesmo que "npm start", sem o npm ficar residente (~40 MB de RAM a menos, que é o que a hospedagem cobra). O exec
# deixa o node como processo principal, recebendo o SIGTERM que fecha o banco antes de sair.
CMD ["sh", "-c", "node scripts/preparar.mjs && exec node server.mjs --mesa"]
