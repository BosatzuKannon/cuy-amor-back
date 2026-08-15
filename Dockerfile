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

# Install ALL dependencies (including devDependencies needed for building)
RUN pnpm install --frozen-lockfile

# Generate the Prisma Client
RUN pnpm dlx prisma generate

# Copy the rest of the application code
COPY . .

# Compile the NestJS application into the /dist folder
RUN pnpm run build

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

# Install ONLY production dependencies to keep the image ultra-light
RUN pnpm install --frozen-lockfile --prod

# Generate the Prisma Client for the production environment
RUN pnpm dlx prisma generate

# Copy the compiled code from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the default NestJS port
EXPOSE 3000

# Run pending migrations against Supabase, then start the application
CMD ["sh", "-c", "pnpm dlx prisma migrate deploy && node dist/src/main.js"]