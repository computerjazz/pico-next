# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npx tsc server.ts --outDir dist --esModuleInterop --module commonjs --skipLibCheck && mv dist/server.js dist/server.cjs

# Stage 2: production image
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=builder /app ./
EXPOSE 3000
CMD ["node", "dist/server.cjs"]