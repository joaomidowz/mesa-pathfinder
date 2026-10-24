# Servidor da mesa para hospedagem com volume persistente (docs/deploy.md).
# A imagem leva só o código: livros, banco e texto extraído vão para o volume (DATA_DIR, BOOKS_DIR).
FROM node:24-slim
WORKDIR /app
COPY . .
RUN node scripts/build-worker.mjs
ENV NODE_ENV=production
CMD ["npm", "start"]
