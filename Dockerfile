FROM mcr.microsoft.com/playwright:v1.48.0-focal

WORKDIR /app

# Only install app deps (Chromium + system libs already in Playwright image)
COPY package*.json ./
RUN npm ci --ignore-scripts && npx playwright install chromium

COPY . .

# Default — Railway overrides per service via Procfile or start command
CMD ["node", "server.js"]
