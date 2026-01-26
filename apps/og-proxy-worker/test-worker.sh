#!/usr/bin/env bash
set -euo pipefail

# Test script for og-proxy-worker
# Usage: ./test-worker.sh [production|development]

MODE="${1:-development}"

if [ "$MODE" = "production" ]; then
  BASE_URL="https://shipyard-og-proxy.jacob-191.workers.dev"
  echo "Testing PRODUCTION worker at: $BASE_URL"
else
  BASE_URL="http://localhost:4446"
  echo "Testing LOCAL worker at: $BASE_URL"
  echo "Make sure worker is running: pnpm dev"
  echo ""
fi

# Sample encoded plan
ENCODED_PLAN="N4IgbiBcCMA0IEsAmUQBcCmBnNBaADgDYCGAdrtAEwDMI8aCahGqAgkkgAQCqWGATp1YBXNAAsMpBgGNiDAPak6IHHOFZU0+QFsiGTCnj8M+eagDK0sfPmFWASQD0WMQnwBPYv0Mh8-KAAslPBaUpJoUADaoMio0Mpo7vgskL5exADm-MT4YsqhmFJRoInJqJgAHhH0GFWoACquWJxEZJwIusza4c0A8iLilJyE8hkIpJwAZiMA7pwzjGKcAOKMABLCAEacxKISUgiyChOT8oLiGDv4RIdyCIoAdCAAvgC6z7AxKKmUCUkpaWyWRyeRCikKEUg0XQ-3KtWq6HhqHsaHapGkhGESGwLX48mSgj4WCw9wm2jImQw3SkO1IXD40mExk4aHkAGtJJwxGQkIRxhknm83vBsXywAJiJtmBooSUkalLMZJC55Kj5JNhqNxi1KS9Poi6qkAGrIDDyTjqzj9PZTWZ6uWGkD1bCo4xYYSENDNfDEYn8l7vIA"

echo ""
echo "=== Test 1: Health Check ==="
curl -s "$BASE_URL/health" | jq .

echo ""
echo "=== Test 2: OG Tag Injection (Slackbot User-Agent) ==="
curl -s -H "User-Agent: Slackbot" "$BASE_URL/?d=$ENCODED_PLAN" | grep -E "og:(title|description)" | head -4

echo ""
echo "=== Test 3: oEmbed Endpoint ==="
curl -s "$BASE_URL/oembed?url=$BASE_URL/?d=$ENCODED_PLAN" | jq .

echo ""
echo "=== Test 4: Regular User (should proxy to upstream) ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "User-Agent: Mozilla/5.0" "$BASE_URL/?d=$ENCODED_PLAN")
if [ "$MODE" = "development" ] && [ "$HTTP_CODE" = "500" ]; then
  echo "✅ Returns 500 (expected - upstream not running)"
elif [ "$MODE" = "production" ] && [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Returns 200 (proxied to GitHub Pages)"
else
  echo "⚠️  Unexpected HTTP code: $HTTP_CODE"
fi

echo ""
echo "=== All Tests Complete ==="
