FROM node:22.15-bookworm-slim AS pruner
WORKDIR /repo
RUN npm install --global turbo@2.5.6
COPY . .
RUN turbo prune @roulette/backend --docker

FROM node:22.15-bookworm-slim AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ ./
RUN npm ci --no-audit --no-fund
COPY --from=pruner /repo/out/full/ ./
# turbo prune leaves out root files the workspace packages' builds extend.
COPY --from=pruner /repo/tsconfig.base.json ./
# Builds the workspace packages the backend uses (e.g. @roulette/engine) before the backend itself.
RUN npx turbo run build --filter=@roulette/backend

FROM builder AS migrate
CMD ["npm", "run", "sequelize", "--workspace=@roulette/backend", "--", "db:migrate"]

FROM builder AS development
CMD ["npm", "run", "start:dev", "--workspace=@roulette/backend"]

FROM builder AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22.15-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /repo
RUN groupadd --system app && useradd --system --gid app --no-create-home app
COPY --from=production-dependencies --chown=app:app /repo/node_modules ./node_modules
COPY --from=production-dependencies --chown=app:app /repo/backend/package.json ./backend/package.json
# npm nests the backend's own dependencies here when their versions clash with other workspaces'.
COPY --from=production-dependencies --chown=app:app /repo/backend/node_modules ./backend/node_modules
COPY --from=builder --chown=app:app /repo/backend/dist ./backend/dist
# node_modules/@roulette/engine is a workspace symlink to this folder.
COPY --from=builder --chown=app:app /repo/packages/roulette-engine/package.json ./packages/roulette-engine/package.json
COPY --from=builder --chown=app:app /repo/packages/roulette-engine/dist ./packages/roulette-engine/dist
USER app
EXPOSE 8080
CMD ["node", "backend/dist/index.js"]
