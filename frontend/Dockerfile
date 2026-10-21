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
COPY frontend ./frontend
WORKDIR /repo/frontend

FROM base AS dev
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM base AS build
# Where the browser finds the API and socket. Leave it empty when a proxy serves
# /api and /socket.io from the site's own domain (as the compose nginx does);
# set it when the backend has its own domain, e.g. https://api.example.com.
ARG VITE_API_ORIGIN=""
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN
RUN npm run build --workspace=@roulette/frontend

FROM nginx:1.27.5-alpine AS production
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
# The nginx image fills ${PORT} in templates at start; hosts such as Railway set it.
ENV PORT=80
RUN rm /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80