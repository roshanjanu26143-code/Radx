FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY src ./src
EXPOSE 5023/tcp
USER node
CMD ["npm", "start"]
