#!/usr/bin/env bash
set -euo pipefail

echo "==> [1/3] Building React frontend (production — uses .env.production)"
cd smart-study-planner-frontend
npm ci --prefer-offline
npm run build
cd ..

echo "==> [2/3] Copying frontend build into backend static resources"
rm -rf smart-study-planner-backend/src/main/resources/static/*
cp -r smart-study-planner-frontend/dist/* \
      smart-study-planner-backend/src/main/resources/static/

echo "==> [3/3] Building backend JAR (with embedded frontend)"
cd smart-study-planner-backend
./mvnw clean package -DskipTests
cd ..

echo "==> Build complete"
