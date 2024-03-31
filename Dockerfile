# Step 1: Base
FROM node:20-alpine AS build

WORKDIR /srv

COPY package*.json ./

RUN npm ci

COPY tsconfig.* ./
COPY src ./src

RUN npm run build

# Step 2: Release
FROM node:20-alpine AS release

WORKDIR /srv

COPY --from=build /srv/node_modules ./node_modules
COPY --from=build /srv/dist ./dist
COPY --from=build package*.json ./

EXPOSE 8080

CMD npm run start
