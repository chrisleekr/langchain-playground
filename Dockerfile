# Step 1: Base
FROM node:22-alpine AS build

WORKDIR /srv

COPY package*.json ./

RUN npm ci

COPY tsconfig.* ./
COPY rspack.config.js ./
COPY src ./src

RUN npm run build

# Step 2: Release
FROM node:22-alpine AS production

WORKDIR /srv

# Install only config package.
RUN npm install config@4.0.0 onnxruntime-node@1.21.0

COPY --from=build /srv/dist ./dist

COPY ./config ./config
COPY ./data ./data
COPY ./package*.json ./

EXPOSE 8080

CMD ["npm", "run", "start"]
