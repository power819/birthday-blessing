# Playwright official image — includes Chromium + all system libs
FROM mcr.microsoft.com/playwright:v1.48.0-focal

WORKDIR /app

# Install only app deps (skip postinstall — Chromium already in image)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy app
COPY . .

# Start web + bot together
RUN printf '#!/bin/bash\nnode server.js &\nPIPE_HOST=0.0.0.0 node bot/bot.js &\nwait\n' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]
