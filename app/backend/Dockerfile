FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY openapi.yaml ./openapi.yaml
ENV NODE_ENV=production
ENV PORT=8080
CMD ["npm", "start"]
