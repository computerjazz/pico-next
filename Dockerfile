# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm test
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build && npm run build:server

# Stage 2: production image
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=builder /app ./
EXPOSE 3000
CMD ["node", "dist/server.js"]