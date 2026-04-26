#!/bin/bash

# ThinkEx Setup Script
# Interactive script to set up ThinkEx for local development
# Uses Docker for PostgreSQL, runs Next.js app locally for hot reload

set -e

C1='\033[38;5;51m'
C2='\033[38;5;45m'
C3='\033[38;5;39m'
C4='\033[38;5;33m'
C5='\033[38;5;27m'
C6='\033[38;5;21m'
RESET='\033[0m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'

print_banner() {
    echo ""
    echo -e "${C1}████████╗██╗  ██╗██╗███╗   ██╗██╗  ██╗███████╗██╗  ██╗${RESET}"
    echo -e "${C2}╚══██╔══╝██║  ██║██║████╗  ██║██║ ██╔╝██╔════╝╚██╗██╔╝${RESET}"
    echo -e "${C3}   ██║   ███████║██║██╔██╗ ██║█████╔╝ █████╗   ╚███╔╝ ${RESET}"
    echo -e "${C4}   ██║   ██╔══██║██║██║╚██╗██║██╔═██╗ ██╔══╝   ██╔██╗ ${RESET}"
    echo -e "${C5}   ██║   ██║  ██║██║██║ ╚████║██║  ██╗███████╗██╔╝ ██╗${RESET}"
    echo -e "${C6}   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝${RESET}"
    echo ""
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

get_env_value() {
    local key=$1
    grep -E "^${key}=" .env 2>/dev/null | head -n1 | cut -d'=' -f2-
}

escape_sed_replacement() {
    printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

set_env_value() {
    local key=$1
    local value=$2
    local escaped_value
    escaped_value=$(escape_sed_replacement "$value")

    if grep -q "^${key}=" .env 2>/dev/null; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^${key}=.*|${key}=${escaped_value}|" .env
        else
            sed -i "s|^${key}=.*|${key}=${escaped_value}|" .env
        fi
    else
        echo "${key}=${value}" >> .env
    fi
}

ensure_env_value() {
    local key=$1
    local fallback=$2
    local current
    current=$(get_env_value "$key")

    if [ -z "$current" ]; then
        set_env_value "$key" "$fallback"
    fi
}

# Function to check PostgreSQL connection
check_postgres() {
    local db_url=$1
    if command_exists psql; then
        # Extract connection details from DATABASE_URL
        if echo "$db_url" | grep -q "postgresql://"; then
            # Try to connect (timeout after 2 seconds)
            timeout 2 psql "$db_url" -c "SELECT 1;" >/dev/null 2>&1
            return $?
        fi
    fi
    return 1
}

# Function to setup .env file
setup_env_file() {
    if [ ! -f .env ]; then
        echo -e "${YELLOW}Creating .env file...${RESET}"
        
        if [ -f .env.example ]; then
            cp .env.example .env
        else
            echo -e "${RED}ERROR: .env.example not found!${RESET}"
            exit 1
        fi
        
        echo -e "${GREEN}Created .env file${RESET}"
    else
        echo -e "${YELLOW}.env file already exists${RESET}"
    fi
    
    # Generate BETTER_AUTH_SECRET if not set
    if ! grep -q "BETTER_AUTH_SECRET=.*[^=]$" .env 2>/dev/null || grep -q "BETTER_AUTH_SECRET=your-better-auth-secret" .env 2>/dev/null || grep -q "BETTER_AUTH_SECRET=your-better-auth-secret-change-this" .env 2>/dev/null; then
        echo -e "${YELLOW}Generating BETTER_AUTH_SECRET...${RESET}"
        SECRET=$(openssl rand -base64 32)
        set_env_value "BETTER_AUTH_SECRET" "$SECRET"
        echo -e "${GREEN}Generated and set BETTER_AUTH_SECRET${RESET}"
    fi

    ensure_env_value "NEXT_PUBLIC_APP_URL" "http://localhost:3000"
    ensure_env_value "BETTER_AUTH_URL" "$(get_env_value NEXT_PUBLIC_APP_URL)"
    ensure_env_value "NEXT_PUBLIC_BETTER_AUTH_URL" "$(get_env_value NEXT_PUBLIC_APP_URL)"
    ensure_env_value "STORAGE_TYPE" "local"
    ensure_env_value "UPLOADS_DIR" "./uploads"
    ensure_env_value "NEXT_PUBLIC_ZERO_SERVER" "http://localhost:4848"
    ensure_env_value "ZERO_COOKIE_DOMAIN" "localhost"
}

configure_zero_env() {
    local db_url=$1
    local app_url
    local zero_admin_password

    app_url=$(get_env_value "NEXT_PUBLIC_APP_URL")
    if [ -z "$app_url" ]; then
        app_url="http://localhost:3000"
        set_env_value "NEXT_PUBLIC_APP_URL" "$app_url"
    fi

    set_env_value "ZERO_UPSTREAM_DB" "$db_url"
    set_env_value "ZERO_QUERY_URL" "${app_url}/api/zero/query"
    set_env_value "ZERO_MUTATE_URL" "${app_url}/api/zero/mutate"
    set_env_value "ZERO_MUTATE_FORWARD_COOKIES" "true"
    set_env_value "ZERO_QUERY_FORWARD_COOKIES" "true"
    ensure_env_value "ZERO_APP_PUBLICATIONS" "zero_pub"
    ensure_env_value "ZERO_APP_ID" "zero_local_dev"

    zero_admin_password=$(get_env_value "ZERO_ADMIN_PASSWORD")
    if [ -z "$zero_admin_password" ] || [ "$zero_admin_password" = "change-me-before-sharing" ] || [ "$zero_admin_password" = "your-local-dev-secret" ]; then
        set_env_value "ZERO_ADMIN_PASSWORD" "$(openssl rand -hex 16)"
    fi
}

# Main setup function
print_banner

echo "Welcome to ThinkEx!"
echo ""
echo -e "${GREEN}This setup uses Docker for PostgreSQL and runs the app locally for hot reload!${RESET}"
echo ""
read -p "Press Enter to continue..."
echo ""

# Check Node.js
if ! command_exists node; then
    echo -e "${RED}ERROR: Node.js is not installed.${RESET}"
    echo "Please install Node.js v20+ from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}ERROR: Node.js v20+ is required. Current version: $(node -v)${RESET}"
    exit 1
fi

# Check pnpm
if ! command_exists pnpm; then
    echo -e "${YELLOW}pnpm is not installed. Installing pnpm...${RESET}"
    npm install -g pnpm
fi

# Check Docker
USE_DOCKER_POSTGRES=true
if ! command_exists docker; then
    echo -e "${YELLOW}WARNING: Docker is not installed.${RESET}"
    echo "Docker is recommended for running PostgreSQL easily."
    echo "Install from: https://docs.docker.com/get-docker/"
    echo ""
    read -p "Do you have PostgreSQL installed locally? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Please install Docker or PostgreSQL, then run this script again."
        exit 1
    fi
    USE_DOCKER_POSTGRES=false
fi

# Check Docker Compose if using Docker
if [ "$USE_DOCKER_POSTGRES" = true ]; then
    if ! command_exists docker-compose && ! docker compose version &> /dev/null; then
        echo -e "${YELLOW}WARNING: Docker Compose is not installed.${RESET}"
        echo "Falling back to local PostgreSQL..."
        USE_DOCKER_POSTGRES=false
    fi
fi

setup_env_file

# Database setup
echo ""
echo -e "${YELLOW}Database Configuration${RESET}"
echo "----------------------"
echo ""

if [ "$USE_DOCKER_POSTGRES" = true ]; then
    echo -e "${GREEN}Using Docker for PostgreSQL${RESET}"
    echo ""
    
    # Check if docker-compose.yml exists
    if [ ! -f docker-compose.yml ]; then
        echo -e "${RED}ERROR: docker-compose.yml not found!${RESET}"
        exit 1
    fi
    
    # Set default PostgreSQL credentials for Docker
    POSTGRES_USER=${POSTGRES_USER:-thinkex}
    POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-thinkex_password_change_me}
    POSTGRES_DB=${POSTGRES_DB:-thinkex}
    POSTGRES_PORT=${POSTGRES_PORT:-5432}
    
    # Export for docker-compose
    export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB POSTGRES_PORT
    
    echo "Starting PostgreSQL container..."
    docker-compose up -d postgres || docker compose up -d postgres
    
    echo ""
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${RESET}"
    sleep 5
    
    # Wait for PostgreSQL to be healthy
    for i in {1..30}; do
        if docker-compose exec -T postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 || docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}PostgreSQL failed to start. Please check Docker logs.${RESET}"
            exit 1
        fi
        sleep 1
    done
    
    DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
    
    # Update .env file with Docker PostgreSQL connection
    if grep -q "^DATABASE_URL=" .env; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
        else
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
        fi
    else
        echo "DATABASE_URL=$DB_URL" >> .env
    fi
    
    echo -e "${GREEN}✓ PostgreSQL is running in Docker${RESET}"
else
    echo -e "${YELLOW}Using local PostgreSQL installation${RESET}"
    echo ""
    
    # Check if DATABASE_URL is already set in .env
    if grep -q "^DATABASE_URL=" .env && ! grep -q "^DATABASE_URL=postgresql://postgres" .env && ! grep -q "^DATABASE_URL=$" .env; then
        DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2- | head -n1)
        if [ -n "$DB_URL" ]; then
            echo -e "${GREEN}Found DATABASE_URL in .env${RESET}"
        else
            DB_URL=""
        fi
    else
        DB_URL=""
    fi
    
    if [ -z "$DB_URL" ]; then
        echo "Please provide your PostgreSQL connection details:"
        echo ""
        read -p "PostgreSQL host [localhost]: " DB_HOST
        DB_HOST=${DB_HOST:-localhost}
        
        read -p "PostgreSQL port [5432]: " DB_PORT
        DB_PORT=${DB_PORT:-5432}
        
        read -p "Database name [thinkex]: " DB_NAME
        DB_NAME=${DB_NAME:-thinkex}
        
        read -p "PostgreSQL user [postgres]: " DB_USER
        DB_USER=${DB_USER:-postgres}
        
        read -sp "PostgreSQL password: " DB_PASSWORD
        echo ""
        
        DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
        
        # Update .env file
        if grep -q "^DATABASE_URL=" .env; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
            else
                sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
            fi
        else
            echo "DATABASE_URL=$DB_URL" >> .env
        fi
        
        echo -e "${GREEN}Database URL configured${RESET}"
    fi
    
    # Test database connection
    echo ""
    echo -e "${YELLOW}Testing database connection...${RESET}"
    if check_postgres "$DB_URL"; then
        echo -e "${GREEN}✓ Database connection successful${RESET}"
    else
        echo -e "${RED}✗ Could not connect to database${RESET}"
        echo "Please check your DATABASE_URL in .env and ensure PostgreSQL is running."
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

configure_zero_env "$DB_URL"

# Create database if it doesn't exist (for local PostgreSQL)
if [ "$USE_DOCKER_POSTGRES" = false ]; then
    echo ""
    echo -e "${YELLOW}Ensuring database exists...${RESET}"
    DB_NAME_FROM_URL=$(echo "$DB_URL" | sed -n 's|.*://[^:]*:[^@]*@[^:]*:[^/]*/\([^?]*\).*|\1|p')
    if [ -z "$DB_NAME_FROM_URL" ]; then
        DB_NAME_FROM_URL="thinkex"
    fi
    
    # Try to create database (will fail if it exists, which is fine)
    CREATE_DB_URL=$(echo "$DB_URL" | sed "s|/${DB_NAME_FROM_URL}|/postgres|")
    psql "$CREATE_DB_URL" -c "CREATE DATABASE $DB_NAME_FROM_URL;" 2>/dev/null || {
        echo "Database already exists or creation skipped."
    }
fi

# Create authenticated role
echo ""
echo -e "${YELLOW}Creating required database roles...${RESET}"
if [ "$USE_DOCKER_POSTGRES" = true ]; then
    docker-compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE ROLE authenticated;" 2>/dev/null || docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE ROLE authenticated;" 2>/dev/null || {
        echo "Role 'authenticated' may already exist, continuing..."
    }
else
    psql "$DB_URL" -c "CREATE ROLE authenticated;" 2>/dev/null || {
        echo "Role 'authenticated' may already exist, continuing..."
    }
fi

# Create auth schema and jwt() function for RLS policies (required by migration)
# Note: This is a mock function for local development. Better Auth handles auth at the app level.
echo ""
echo -e "${YELLOW}Creating auth schema for RLS policies...${RESET}"
if [ "$USE_DOCKER_POSTGRES" = true ]; then
    docker-compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE SCHEMA IF NOT EXISTS auth;" 2>/dev/null || docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE SCHEMA IF NOT EXISTS auth;" 2>/dev/null || true
    docker-compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS \$func\$ SELECT NULL::jsonb; \$func\$;" 2>/dev/null || docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS \$func\$ SELECT NULL::jsonb; \$func\$;" 2>/dev/null || true
else
    psql "$DB_URL" -c "CREATE SCHEMA IF NOT EXISTS auth;" 2>/dev/null || true
    psql "$DB_URL" -c "CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS \$func\$ SELECT NULL::jsonb; \$func\$;" 2>/dev/null || true
fi

echo ""
echo -e "${YELLOW}Creating Zero publication for local sync...${RESET}"
ZERO_APP_PUBLICATIONS=$(get_env_value "ZERO_APP_PUBLICATIONS")
ZERO_APP_PUBLICATIONS=${ZERO_APP_PUBLICATIONS:-zero_pub}
if [ "$USE_DOCKER_POSTGRES" = true ]; then
    docker-compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE PUBLICATION ${ZERO_APP_PUBLICATIONS} FOR TABLES IN SCHEMA public;" 2>/dev/null || docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE PUBLICATION ${ZERO_APP_PUBLICATIONS} FOR TABLES IN SCHEMA public;" 2>/dev/null || {
        echo "Publication '${ZERO_APP_PUBLICATIONS}' may already exist, continuing..."
    }
else
    psql "$DB_URL" -c "CREATE PUBLICATION ${ZERO_APP_PUBLICATIONS} FOR TABLES IN SCHEMA public;" 2>/dev/null || {
        echo "Publication '${ZERO_APP_PUBLICATIONS}' may already exist, continuing..."
    }
fi

# Install dependencies
echo ""
echo -e "${YELLOW}Installing dependencies...${RESET}"
pnpm install

# Run migrations
echo ""
echo -e "${YELLOW}Running database migrations...${RESET}"
if [ -f drizzle/0000_sad_wallflower.sql ]; then
    if [ "$USE_DOCKER_POSTGRES" = true ]; then
        CONTAINER_ID=$(docker-compose ps -q postgres 2>/dev/null || docker compose ps -q postgres 2>/dev/null)
        if [ -n "$CONTAINER_ID" ]; then
            docker cp drizzle/0000_sad_wallflower.sql "$CONTAINER_ID:/tmp/migration.sql" 2>/dev/null
            docker-compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/migration.sql 2>&1 | grep -v "already exists" | grep -v "NOTICE" | grep -v "relation.*already exists" || docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/migration.sql 2>&1 | grep -v "already exists" | grep -v "NOTICE" | grep -v "relation.*already exists" || {
                echo "Migration file applied (some errors about existing objects are normal)."
            }
            docker exec "$CONTAINER_ID" rm /tmp/migration.sql 2>/dev/null || true
        fi
    else
        psql "$DB_URL" -f drizzle/0000_sad_wallflower.sql 2>&1 | grep -v "already exists" | grep -v "NOTICE" | grep -v "relation.*already exists" || {
            echo "Migration file applied (some errors about existing objects are normal)."
        }
    fi
fi

echo ""
echo -e "${YELLOW}Pushing any remaining schema changes...${RESET}"
pnpm drizzle-kit push --force || {
    echo "Schema push completed or no changes needed."
}

echo ""
echo -e "${GREEN}✓ Core self-host bootstrap complete!${RESET}"
echo ""
echo -e "${YELLOW}Configured for core self-host:${RESET}"
echo "   - PostgreSQL connection"
echo "   - Better Auth local URLs + secret"
echo "   - Zero local defaults and publication (${ZERO_APP_PUBLICATIONS})"
echo "   - Local filesystem storage (STORAGE_TYPE=local)"
echo ""
echo -e "${YELLOW}Optional next steps:${RESET}"
echo "   - Add your AI backend credentials for chat/autogen features"
echo "   - Add provider-reachable storage + media keys if you need OCR, audio transcription, or office conversion"
echo ""
if [ "$USE_DOCKER_POSTGRES" = true ]; then
    echo "PostgreSQL is running in Docker. Useful commands:"
    echo "  - Stop PostgreSQL:    docker-compose down"
    echo "  - Start PostgreSQL:    docker-compose up -d"
    echo "  - View logs:            docker-compose logs -f postgres"
    echo ""
fi
echo ""
echo -e "${GREEN}Start ThinkEx with:${RESET} pnpm dev"
echo "That command starts Next.js, the AI SDK devtools, and Zero together."
echo "Access ThinkEx at: http://localhost:3000"
