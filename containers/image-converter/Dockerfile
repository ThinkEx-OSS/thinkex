FROM node:22-trixie-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends libvips-tools \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs /app/server.mjs

EXPOSE 8080
CMD ["node", "/app/server.mjs"]
