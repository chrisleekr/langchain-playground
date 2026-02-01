# syntax=docker/dockerfile:1

# Node version passed from .nvmrc via --build-arg (defaults to 22 for local builds)
ARG NODE_VERSION=22

# Step 1: Build stage
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS build

WORKDIR /srv

COPY package*.json ./

RUN npm ci

COPY tsconfig.* ./
COPY rspack.config.js ./
COPY src ./src

RUN npm run build

# Step 2: Production stage
# Re-declare ARG before FROM (Docker requirement - ARGs don't persist across stages)
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS production

ARG PACKAGE_VERSION
ARG GIT_HASH
ARG NODE_ENV=production

LABEL org.opencontainers.image.version="${PACKAGE_VERSION}" \
  org.opencontainers.image.revision="${GIT_HASH}"

WORKDIR /srv

# Copy package files for production dependency installation
COPY package*.json ./

# Install production dependencies only (includes onnxruntime-node with correct native bindings)
RUN npm ci --omit=dev --ignore-scripts && \
  npm cache clean --force

# Copy pre-built dist from build stage (platform-independent JavaScript)
COPY --from=build /srv/dist ./dist

COPY ./config ./config
COPY ./data ./data

EXPOSE 8080

CMD ["npm", "run", "start"]
