#!/bin/bash

# Log in to get the token (assuming you have a test user, otherwise create one first)
echo "Logging in to get token..."
RESPONSE=$(curl -s -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"email":"test@test.com"}')

# Extract token using simple text parsing (no jq required)
TOKEN=$(echo $RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Failed to get token. Response was: $RESPONSE"
  exit 1
fi

echo "Successfully logged in."
echo "Testing /api/agent/chat endpoint..."
echo "--------------------------------------------------"

curl -N -X POST http://localhost:8000/api/agent/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!", "project_id": 1}'

echo -e "\n--------------------------------------------------"
echo "Done."
