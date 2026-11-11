FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @plateforme/web --workspace @plateforme/contracts --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
# API_INTERNAL_URL est lu à la construction pour le proxy /api (next.config.ts)
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @plateforme/contracts && npm run build -w @plateforme/web

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@plateforme/web"]
