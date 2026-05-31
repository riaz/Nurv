FROM node:20-alpine AS builder

WORKDIR /app

# We will copy package.json once we initialize the frontend
# For now, we will create a placeholder or just copy everything
COPY package*.json ./
# If package.json exists, install dependencies
RUN if [ -f package.json ]; then npm install; fi

COPY . .

# Build the app (if we have a build script)
RUN if [ -f package.json ]; then npm run build; fi

# For development using Vite
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
