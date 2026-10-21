FROM node:22.15-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY mobile/package.json mobile/package.json
COPY admin/package.json admin/package.json
COPY packages packages
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY admin ./admin
WORKDIR /repo/admin

FROM base AS dev
EXPOSE 5174
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm run build --workspace=@roulette/admin

FROM nginx:1.27.5-alpine AS production
# Built with base /admin/, so the files live under that path too.
COPY --from=build /repo/admin/dist /usr/share/nginx/html/admin
ENV PORT=80
RUN rm /etc/nginx/conf.d/default.conf
COPY admin/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
