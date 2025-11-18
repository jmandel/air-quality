#!/bin/bash
# Migration script for upgrading old database to new schema
# Run this once if you have an existing database from before the optimization

set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

DB_FILE="${1:-db.sqlite}"

if [ ! -f "$DB_FILE" ]; then
    echo "❌ Database file not found: $DB_FILE"
    echo "Usage: ./migrate.sh [db_file]"
    exit 1
fi

echo "🔄 Migrating database: $DB_FILE"
echo ""

# Create backup
BACKUP_FILE="${DB_FILE}.pre-migration-$(date +%Y%m%d-%H%M%S)"
cp "$DB_FILE" "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"

# Run migrations in order
for migration in migrations/*.sql; do
    echo "📝 Running: $migration"
    sqlite3 "$DB_FILE" < "$migration"
done

echo ""
echo "✅ Migration complete!"
echo ""
echo "Database stats:"
sqlite3 "$DB_FILE" "SELECT
    (SELECT COUNT(*) FROM sensors) as sensors,
    (SELECT COUNT(*) FROM readings) as raw_readings,
    (SELECT COUNT(*) FROM readings_aggregated) as aggregated_minutes;"
