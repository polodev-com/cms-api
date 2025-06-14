# --- Stage 1: Build ---
# Use an official Node.js runtime as a parent image (LTS version is a good choice)
FROM node:18-alpine AS builder

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install app dependencies
RUN npm install --omit=dev --no-optional && npm cache clean --force

# Copy the rest of the application source code
COPY . .

# --- Stage 2: Production ---
# Use a smaller base image for the production stage
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Create a non-root user and group for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy dependencies from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application code from the builder stage
COPY --from=builder /usr/src/app .

# Change ownership of the app directory to the non-root user
RUN chown -R appuser:appgroup /usr/src/app

# Switch to the non-root user
USER appuser

EXPOSE 3000

CMD [ "node", "index.js" ]
