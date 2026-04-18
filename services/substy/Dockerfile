FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

COPY package.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p screenshots

EXPOSE 3001

CMD ["node", "server.js"]
