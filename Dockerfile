FROM node:20-slim

WORKDIR /app

# Install Chromium dependencies (lightweight, no full Playwright image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2t64 libx11-xcb1 libxcb1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

CMD ["node", "server.js"]
