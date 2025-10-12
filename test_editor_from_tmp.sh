#!/bin/bash
# Test the editor from /tmp to verify it finds project root

cd /tmp
echo "Running editor from: $(pwd)"
echo ""

# Run the editor for 2 seconds
/Users/kevinknapp/Documents/'Documents - Kevin'"'"'s MacBook Air'/GitHub/2DExplorationGame/build/editor &
EDITOR_PID=$!

sleep 2

# Send Ctrl+C to exit gracefully
kill -INT $EDITOR_PID 2>/dev/null
wait $EDITOR_PID 2>/dev/null

echo ""
echo "Test complete!"

