# Look Over There, multiplayer: one Node process serves the game and relays the room.
FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server/server.js server/
COPY index.html ./
COPY world world
COPY monsters monsters
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/server.js"]
