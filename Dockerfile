FROM oven/bun:1 AS web-builder
WORKDIR /src/web

COPY web/package.json ./
COPY web/tsconfig.json ./
COPY web/tsconfig.node.json ./
COPY web/vite.config.ts ./
COPY web/tailwind.config.ts ./
COPY web/postcss.config.js ./
COPY web/components.json ./
RUN bun install

COPY web/index.html ./
COPY web/public ./public
COPY web/src ./src
RUN bun run build

FROM golang:alpine AS go-builder
WORKDIR /src

COPY go.mod ./
COPY config ./config
COPY internal ./internal
COPY main.go ./
COPY third_party ./third_party
COPY --from=web-builder /src/web/dist ./web/dist

RUN go build -o /out/traefik-route-manager .

FROM alpine:3.21
WORKDIR /app

RUN adduser -D -u 10001 appuser && \
    apk add --no-cache ca-certificates

COPY --from=go-builder /out/traefik-route-manager /app/traefik-route-manager
COPY --from=web-builder /src/web/dist /app/web/dist

ENV ADDR=:8892
ENV CONFIG_DIR=/data
EXPOSE 8892
VOLUME ["/data"]

USER appuser

ENTRYPOINT ["/app/traefik-route-manager"]
