# xFoundry Docs - Docker Deployment Guide

This guide covers how to build, deploy, and maintain your xFoundry-branded Outline instance using Docker.

## Table of Contents
1. [Quick Start](#quick-start)
2. [Building Docker Images](#building-docker-images)
3. [Automated GitHub Actions Build](#automated-github-actions-build)
4. [Running with Docker Compose](#running-with-docker-compose)
5. [Deployment Options](#deployment-options)
6. [Updating & Maintenance](#updating--maintenance)

---

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Docker Hub account OR GitHub account (for GHCR)
- `.env` file configured (copy from `.env.sample`)

### Fastest Start (Using Pre-built Image)

```bash
# 1. Create your environment file
cp .env.sample .env
# Edit .env with your configuration

# 2. Start everything with Docker Compose
docker-compose -f docker-compose.xfoundry.yml up -d

# 3. Access at http://localhost:3000
```

---

## Building Docker Images

### Two-Stage Build Process

Outline uses a two-stage Docker build:
1. **Base Image** (`Dockerfile.base`) - Contains Node.js dependencies (rarely changes)
2. **Main Image** (`Dockerfile`) - Contains your xFoundry-branded application

### Local Build

```bash
# Build base image
docker build -f Dockerfile.base -t xfoundry/outline-base:latest .

# Build main image with your branding
docker build \
  --build-arg BASE_IMAGE=xfoundry/outline-base:latest \
  -t xfoundry/outline-docs:latest \
  -t xfoundry/outline-docs:v1.0.0 \
  .

# Test locally
docker run -d \
  --name xfoundry-test \
  -p 3000:3000 \
  --env-file .env \
  xfoundry/outline-docs:latest
```

### Push to Docker Hub

```bash
# Login
docker login

# Push both images
docker push xfoundry/outline-base:latest
docker push xfoundry/outline-docs:latest
docker push xfoundry/outline-docs:v1.0.0
```

### Alternative: GitHub Container Registry (GHCR)

GHCR is **free for public repositories** and integrates seamlessly with GitHub Actions.

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Tag for GHCR
docker tag xfoundry/outline-docs:latest ghcr.io/xfoundry/outline-docs:latest

# Push
docker push ghcr.io/xfoundry/outline-docs:latest
```

---

## Automated GitHub Actions Build

I've created `.github/workflows/xfoundry-docker.yml` for you. Here's how to set it up:

### Setup for Docker Hub

1. **Create Docker Hub Access Token**:
   - Go to https://hub.docker.com/settings/security
   - Create new access token with Read & Write permissions

2. **Add GitHub Secrets**:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add secrets:
     - `DOCKERHUB_USERNAME`: Your Docker Hub username
     - `DOCKERHUB_TOKEN`: Your access token

3. **Update workflow** (`.github/workflows/xfoundry-docker.yml`):
   ```yaml
   env:
     IMAGE_NAME: xfoundry/outline-docs
     BASE_IMAGE_NAME: xfoundry/outline-base
   ```

4. **Uncomment Docker Hub login** in the workflow:
   ```yaml
   - name: Login to Docker Hub
     uses: docker/login-action@v3
     with:
       username: ${{ secrets.DOCKERHUB_USERNAME }}
       password: ${{ secrets.DOCKERHUB_TOKEN }}
   ```

### Setup for GitHub Container Registry (GHCR) - Recommended!

**Advantages**: Free, no token needed, automatic integration.

1. **Enable GHCR for your repo**:
   - Settings → Actions → General
   - Workflow permissions: Read and write permissions ✓

2. **Update workflow** (`.github/workflows/xfoundry-docker.yml`):
   ```yaml
   env:
     IMAGE_NAME: ghcr.io/xfoundry/outline-docs
     BASE_IMAGE_NAME: ghcr.io/xfoundry/outline-base
   ```

3. **That's it!** GHCR login is already configured with `GITHUB_TOKEN`

### Triggering Builds

The workflow builds automatically on:
- **Push to `xfoundry-branding` or `main`** branches
- **Creating tags** like `xf-v1.0.0`
- **Manual trigger** via GitHub Actions UI

```bash
# Trigger a build with a tag
git tag xf-v1.0.0
git push origin xf-v1.0.0

# Or push to the branch
git push origin xfoundry-branding
```

---

## Running with Docker Compose

### Development Setup

```bash
# Use the xFoundry compose file
docker-compose -f docker-compose.xfoundry.yml up -d

# View logs
docker-compose -f docker-compose.xfoundry.yml logs -f outline

# Stop everything
docker-compose -f docker-compose.xfoundry.yml down

# Stop and remove volumes (⚠️ deletes data)
docker-compose -f docker-compose.xfoundry.yml down -v
```

### Production Setup

For production, customize `docker-compose.xfoundry.yml`:

```yaml
services:
  outline:
    image: xfoundry/outline-docs:v1.0.0  # Pin to specific version
    restart: always  # Always restart
    environment:
      NODE_ENV: production
      # Add production-specific settings
```

### Environment Variables

Key variables for `.env`:

```bash
# Required
SECRET_KEY=generate_with_openssl_rand_hex_32
UTILS_SECRET=another_random_secret_32_bytes
URL=https://docs.xfoundry.com

# Database (auto-configured in docker-compose)
DATABASE_URL=postgres://outline:outline@postgres:5432/outline
REDIS_URL=redis://redis:6379

# File Storage
FILE_STORAGE=local
# Or use S3:
# FILE_STORAGE=s3
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...
# AWS_S3_UPLOAD_BUCKET_NAME=...

# Email (optional but recommended)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=xfoundry-docs@xfoundry.com

# Auth Providers (at least one required)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Or Slack, Azure AD, OIDC, etc.
```

---

## Deployment Options

### 1. Local Server / VPS

```bash
# SSH to your server
ssh user@your-server.com

# Clone your repo
git clone https://github.com/xFoundry/outline.git
cd outline
git checkout xfoundry-branding

# Configure environment
cp .env.sample .env
nano .env  # Edit with your settings

# Start services
docker-compose -f docker-compose.xfoundry.yml up -d

# Setup nginx reverse proxy (optional)
```

### 2. AWS ECS / Fargate

```bash
# Push image to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ECR_URL
docker tag xfoundry/outline-docs:latest YOUR_ECR_URL/xfoundry-docs:latest
docker push YOUR_ECR_URL/xfoundry-docs:latest

# Create ECS task definition and service via AWS Console or CLI
```

### 3. Kubernetes

```bash
# Create deployment
kubectl create deployment xfoundry-docs \
  --image=xfoundry/outline-docs:latest \
  --port=3000

# Expose service
kubectl expose deployment xfoundry-docs \
  --type=LoadBalancer \
  --port=80 \
  --target-port=3000

# Add secrets for environment variables
kubectl create secret generic xfoundry-env --from-env-file=.env
```

### 4. DigitalOcean App Platform

```bash
# Push to Docker Hub or GHCR first
docker push xfoundry/outline-docs:latest

# Then create app via DO Console:
# - Select Docker Hub / GHCR as source
# - Image: xfoundry/outline-docs:latest
# - Add managed PostgreSQL & Redis databases
# - Configure environment variables
```

### 5. Render / Railway / Fly.io

These platforms can deploy directly from your GitHub repo:

1. Connect your `xFoundry/outline` repository
2. Select `xfoundry-branding` branch
3. Configure build settings:
   - Dockerfile: `Dockerfile`
   - Build command: Auto-detected
4. Add environment variables
5. Deploy!

---

## Updating & Maintenance

### Update Your Container

```bash
# Pull latest changes
git pull origin xfoundry-branding

# Rebuild images
docker-compose -f docker-compose.xfoundry.yml build --no-cache

# Restart with new image
docker-compose -f docker-compose.xfoundry.yml up -d

# Or if using pre-built images:
docker pull xfoundry/outline-docs:latest
docker-compose -f docker-compose.xfoundry.yml up -d
```

### Run Database Migrations

```bash
# After updating, run migrations
docker-compose -f docker-compose.xfoundry.yml exec outline yarn db:migrate
```

### Backup & Restore

```bash
# Backup PostgreSQL
docker exec xfoundry-postgres pg_dump -U outline outline > backup_$(date +%Y%m%d).sql

# Backup file storage
docker run --rm -v outline_outline_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/outline_data_$(date +%Y%m%d).tar.gz /data

# Restore PostgreSQL
cat backup_20250423.sql | docker exec -i xfoundry-postgres psql -U outline outline

# Restore file storage
docker run --rm -v outline_outline_data:/data -v $(pwd):/backup alpine \
  sh -c "cd / && tar xzf /backup/outline_data_20250423.tar.gz"
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.xfoundry.yml logs -f

# Just Outline
docker-compose -f docker-compose.xfoundry.yml logs -f outline

# Last 100 lines
docker-compose -f docker-compose.xfoundry.yml logs --tail=100 outline
```

### Health Checks

```bash
# Check container health
docker ps

# Test health endpoint
curl http://localhost:3000/_health

# Should return: OK
```

---

## Continuous Deployment

### Auto-deploy on Git Push

Set up a webhook to your server:

```bash
# On your server, create webhook listener
# Install webhook: https://github.com/adnanh/webhook

# Create hooks.json:
cat > hooks.json <<EOF
[
  {
    "id": "xfoundry-deploy",
    "execute-command": "/opt/xfoundry/deploy.sh",
    "command-working-directory": "/opt/xfoundry/outline",
    "response-message": "Deploying xFoundry Docs...",
    "trigger-rule": {
      "match": {
        "type": "payload-hash-sha256",
        "secret": "YOUR_WEBHOOK_SECRET",
        "parameter": {
          "source": "header",
          "name": "X-Hub-Signature-256"
        }
      }
    }
  }
]
EOF

# Create deploy script
cat > /opt/xfoundry/deploy.sh <<'EOF'
#!/bin/bash
cd /opt/xfoundry/outline
git pull origin xfoundry-branding
docker-compose -f docker-compose.xfoundry.yml pull
docker-compose -f docker-compose.xfoundry.yml up -d
docker-compose -f docker-compose.xfoundry.yml exec outline yarn db:migrate
EOF

chmod +x /opt/xfoundry/deploy.sh

# Start webhook
webhook -hooks hooks.json -port 9000
```

Then add the webhook URL to your GitHub repo settings.

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose -f docker-compose.xfoundry.yml logs outline

# Common issues:
# 1. Database not ready: Wait for postgres healthcheck
# 2. Missing SECRET_KEY: Check .env file
# 3. Port conflict: Change port in docker-compose.yml
```

### Database connection errors
```bash
# Verify database is running
docker-compose -f docker-compose.xfoundry.yml ps postgres

# Test connection
docker-compose -f docker-compose.xfoundry.yml exec postgres \
  psql -U outline -d outline -c "SELECT 1;"
```

### Performance issues
```bash
# Increase memory limits in docker-compose.yml
services:
  outline:
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
```

---

## Support

- **GitHub Issues**: https://github.com/xFoundry/outline/issues
- **Outline Docs**: https://docs.getoutline.com/s/hosting/
- **Docker Docs**: https://docs.docker.com/

---

## Next Steps

1. ✅ Set up automated builds with GitHub Actions
2. ✅ Configure your production environment
3. ✅ Set up backups
4. ✅ Add SSL/TLS with reverse proxy (nginx, Caddy, Traefik)
5. ✅ Monitor with logging & metrics
