#!/bin/bash

# Deploy theme to local Ghost installation
# This script builds the theme and copies it to the local Ghost themes directory

set -e  # Exit on any error

THEME_NAME="headline"
GHOST_DIR="/Users/annemarie/Documents/temp/GitHub/ghost/lghost"
THEME_DEST="$GHOST_DIR/content/themes/$THEME_NAME"
VERSION=$(date +%Y%m%d-%H%M%S)
ZIP_NAME="${THEME_NAME}-${VERSION}.zip"

echo "📦 Version: $VERSION"
echo ""
echo "🔨 Building theme..."
npx gulp build 2>/dev/null || npx gulp

echo "📦 Copying theme to Ghost..."
# Create backup of current theme
if [ -d "$THEME_DEST" ]; then
    echo "   Backing up existing theme..."
    cp -r "$THEME_DEST" "$THEME_DEST.backup-$(date +%Y%m%d-%H%M%S)"
fi

# Copy all theme files
echo "   Copying files..."
rsync -av --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.DS_Store' \
    --exclude='*.code-workspace' \
    --exclude='deploy-local.sh' \
    ./ "$THEME_DEST/"

echo "✅ Theme deployed successfully!"
echo ""
echo "� Creating versioned zip archive..."
cd "$THEME_DEST"
zip -q -r "/tmp/$ZIP_NAME" . \
    -x "*.git*" \
    -x "*node_modules*" \
    -x "*.DS_Store" \
    -x "*.code-workspace" \
    -x "*deploy-local.sh"
echo "   Saved to: /tmp/$ZIP_NAME"
ls -lh "/tmp/$ZIP_NAME" | awk '{print "   Size: " $5}'
echo ""
echo "�🔄 Restarting Ghost..."
cd "$GHOST_DIR"
ghost restart

echo ""
echo "✅ All done! Ghost is running with updated theme."
echo "📦 Version: $VERSION"
echo "   Zip: /tmp/$ZIP_NAME"
echo ""
echo "If theme doesn't appear, activate it in Ghost Admin → Settings → Design"
