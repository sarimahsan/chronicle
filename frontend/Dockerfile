# Base node image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start Vite dev server binding to host
CMD ["npm", "run", "dev"]
