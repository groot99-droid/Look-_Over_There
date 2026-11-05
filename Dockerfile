# Look Over There, multiplayer: one Node process serves the game and relays the room.
# Stage 1 builds the game's sounds from the author's sound library (public GitHub release; about 760 MB of range reads, a few minutes). Docker caches it
# until audio/cues.json, audio/sources.lock.json or tools/build_audio.py change. If the library cannot be reached the build still succeeds and the game is silent.
FROM debian:bookworm-slim AS audio
RUN apt-get update && apt-get install -y --no-install-recommends python3 ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY audio/cues.json audio/sources.lock.json audio/
COPY tools/build_audio.py tools/
RUN python3 tools/build_audio.py --allow-partial --aac || mkdir -p audio/files

FROM node:22-slim
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server/server.js server/
COPY index.html ./
COPY world world
COPY monsters monsters
COPY characters characters
COPY shared shared
COPY models models
COPY audio/engine.js audio/cues.json audio/
COPY --from=audio /build/audio/files audio/files
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/server.js"]
