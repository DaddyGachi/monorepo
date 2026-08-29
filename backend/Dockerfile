FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --chown=app:app package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=app:app --from=build /app/dist ./dist
COPY --chown=app:app --from=build /app/migrations ./migrations

USER app

EXPOSE 4000

CMD ["node", "dist/index.js"]
