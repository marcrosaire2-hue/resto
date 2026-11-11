FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @plateforme/api --workspace @plateforme/contracts --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @plateforme/contracts && npm run build -w @plateforme/api \
 && npm prune --omit=dev --workspace @plateforme/api --workspace @plateforme/contracts

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/contracts/package.json packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
