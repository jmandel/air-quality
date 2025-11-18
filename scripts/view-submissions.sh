#!/bin/bash
# View detailed device submission logs

if [ "$1" == "-f" ] || [ "$1" == "--follow" ]; then
    echo "Following live submissions (Ctrl+C to stop)..."
    sudo journalctl -u air1-logger -f | grep --line-buffered "📋 Submission details:" | while read -r line; do
        echo "$line" | sed 's/.*📋 Submission details: //' | jq -C '.'
        echo "---"
    done
else
    SINCE="${1:-10 minutes ago}"
    echo "Showing submissions since: $SINCE"
    echo "=========================================="
    sudo journalctl -u air1-logger --since "$SINCE" | grep "📋 Submission details:" | while read -r line; do
        echo "$line" | sed 's/.*📋 Submission details: //' | jq '.'
        echo "---"
    done
fi
