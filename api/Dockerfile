# Build context is the REPO ROOT (see infra/github-workflows/deploy.yml:
#   context: . , file: api/Dockerfile) so the OSM data snapshot can be baked in.
FROM node:22-alpine

WORKDIR /app
COPY api/package.json ./
RUN npm install --omit=dev

COPY api/src ./src
COPY api/public ./public
COPY data/alula-roads.json ./data/alula-roads.json

ENV NODE_ENV=production \
    PORT=3000 \
    OSM_DATA_FILE=/app/data/alula-roads.json

EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
