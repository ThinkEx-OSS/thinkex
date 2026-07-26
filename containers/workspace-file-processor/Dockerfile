FROM node:22-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends libvips-tools poppler-utils \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server.mjs ./

USER node

EXPOSE 8080

CMD ["node", "server.mjs"]
