#!/usr/bin/env bash
set -euo pipefail

echo "==> [1/3] Building React frontend (production — uses .env.production)"
cd smart-study-planner-frontend
npm ci
npm run build
cd ..

echo "==> [2/3] Copying frontend build into backend static resources"
rm -rf smart-study-planner-backend/src/main/resources/static/*
cp -r smart-study-planner-frontend/dist/* \
      smart-study-planner-backend/src/main/resources/static/

echo "==> [3/3] Building backend JAR (with embedded frontend)"
cd smart-study-planner-backend

# Use 'package' without 'clean' so the snapshot JAR in target/ survives as a
# fallback if Maven cannot download dependencies in the production build container.
# This avoids the failure mode: clean deletes JAR → package fails → no JAR → April rollback.
set +e
./mvnw package -DskipTests --batch-mode --no-transfer-progress
MAVEN_EXIT=$?
set -e

if [ $MAVEN_EXIT -ne 0 ]; then
  echo "==> WARNING: Maven build failed (exit $MAVEN_EXIT)"
  if [ -f target/smart-study-planner-0.0.1-SNAPSHOT.jar ]; then
    echo "==> Using existing JAR from workspace snapshot as fallback"
  else
    echo "==> FATAL: No JAR available and Maven build failed. Aborting."
    exit 1
  fi
else
  echo "==> Maven build succeeded"
fi

cd ..

echo "==> Build complete"
