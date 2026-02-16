FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ src/
COPY config/ config/
COPY ecosystem.config.js ./

RUN mkdir -p data logs

EXPOSE 3000

CMD ["node", "src/index.js"]
