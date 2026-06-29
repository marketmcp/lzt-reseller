FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=3000 HOST=0.0.0.0
EXPOSE 3000
# секреты передаются через --env-file .env (не копируются в образ)
CMD ["node", "server/index.js"]
