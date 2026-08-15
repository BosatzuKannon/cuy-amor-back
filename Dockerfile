# ---------------------------------------------------
# Stage 1: Build Environment
# ---------------------------------------------------
FROM node:22-alpine AS builder

# Set the working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package management files first to cache dependencies
COPY package.json pnpm-lock.yaml ./

# Copy the Prisma schema folder
COPY prisma ./prisma/

# Install ALL dependencies ignoring scripts to bypass pnpm v9 security block
RUN pnpm install --frozen-lockfile --ignore-scripts

# Manually generate Prisma Client using npx (safest execution)
RUN npx prisma@6 generate

# Copy the rest of the application code
COPY . .

# Compile the NestJS application into the /dist folder
RUN npm run build

# ---------------------------------------------------
# Stage 2: Production Environment
# ---------------------------------------------------
FROM node:22-alpine AS production

# Set the working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package management files
COPY package.json pnpm-lock.yaml ./

# Copy the Prisma schema folder again
COPY prisma ./prisma/

# Install ONLY production dependencies ignoring scripts
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Generate the Prisma Client using strictly version 6 to avoid breaking changes
RUN npx prisma@6 generate

# Copy the compiled code from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the default NestJS port
EXPOSE 3000

# Run pending migrations against Supabase with version 6, then start the application
CMD ["sh", "-c", "npx prisma@6 migrate deploy && node dist/src/main.js"]