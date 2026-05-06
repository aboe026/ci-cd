#!/bin/sh
set -e # exit immediately with bad status code on error

echo ""
echo "🚀 Starting Caddy Entrypoint"
echo "────────────────────────────────────────────"
echo "📅 Date: $(date -u)"
echo "📁 Working Directory: $(pwd)"
echo "🔍 Environment Sources: /etc/caddy/priv.env, /etc/caddy/.env"
echo "────────────────────────────────────────────"
echo ""


# CADDY_DOMAIN
echo "🔍 Attempting to resolve CADDY_DOMAIN..."
if [ -n "$CADDY_DOMAIN" ]; then
  echo "Using CADDY_DOMAIN from environment: $CADDY_DOMAIN"
elif [ -f /etc/caddy/priv.env ]; then
  echo "Loading CADDY_DOMAIN from priv.env"
  CADDY_DOMAIN=$(grep '^CADDY_DOMAIN=' /etc/caddy/priv.env | cut -d '=' -f2)
elif [ -f /etc/caddy/.env ]; then
  echo "Loading CADDY_DOMAIN from .env"
  CADDY_DOMAIN=$(grep '^CADDY_DOMAIN=' /etc/caddy/.env | cut -d '=' -f2)
fi

if [ -z "$CADDY_DOMAIN" ]; then
  echo "❌ Error: CADDY_DOMAIN is empty after resolution, must specify as either environment variable or in .env or priv.env."
  exit 1
fi

echo "✅ Resolved CADDY_DOMAIN to: \"$CADDY_DOMAIN\""
echo ""

# CADDY_TLS_MODE
echo "🔍 Attempting to resolve CADDY_TLS_MODE..."
if [ -n "$CADDY_TLS_MODE" ]; then
  echo "Using CADDY_TLS_MODE from environment: $CADDY_TLS_MODE"
elif [ -f /etc/caddy/priv.env ]; then
  echo "Loading CADDY_TLS_MODE from priv.env"
  CADDY_TLS_MODE=$(grep '^CADDY_TLS_MODE=' /etc/caddy/priv.env | cut -d '=' -f2)
elif [ -f /etc/caddy/.env ]; then
  echo "Loading CADDY_TLS_MODE from .env"
  CADDY_TLS_MODE=$(grep '^CADDY_TLS_MODE=' /etc/caddy/.env | cut -d '=' -f2)
fi

echo "✅ Resolved CADDY_TLS_MODE to: \"$CADDY_TLS_MODE\""
echo ""

# Substitute placeholders in the template
echo "🔧 Substituting resolved values in /etc/caddy/Caddyfile.template to produce /etc/caddy/Caddyfile"
sed "s/{\$DOMAIN}/$CADDY_DOMAIN/g" /etc/caddy/Caddyfile.template | \
sed "s/{\$TLS_MODE}/$CADDY_TLS_MODE/g" > /etc/caddy/Caddyfile

echo "✅ Resolved Caddyfile:"
echo ""
cat /etc/caddy/Caddyfile
echo ""

# Start Caddy
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile