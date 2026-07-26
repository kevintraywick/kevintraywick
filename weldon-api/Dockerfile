# node 22: pdfjs-dist (plan PDF → per-page images) requires >=22.13, and node 20
# is past end-of-life
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
