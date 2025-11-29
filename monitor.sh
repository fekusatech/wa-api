#!/bin/bash

# WhatsApp API Monitoring Script
# Usage: ./monitor.sh

API_BASE="http://localhost:3000/api"
LOGFILE="/tmp/wa-api-monitor.log"

echo "WhatsApp API Gateway Monitor"
echo "============================"
echo ""

# Function to make API call and check response
check_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo -n "Checking $description... "
    response=$(curl -s -o /dev/null -w "%{http_code}" "${API_BASE}${endpoint}")
    
    if [ "$response" = "200" ]; then
        echo "✓ OK"
        return 0
    else
        echo "✗ FAILED (HTTP $response)"
        return 1
    fi
}

# Function to get detailed health info
get_health_details() {
    echo "Health Details:"
    echo "==============="
    curl -s "${API_BASE}/health" | jq '.' 2>/dev/null || curl -s "${API_BASE}/health"
    echo ""
}

# Function to get queue status
get_queue_status() {
    echo "Queue Status:"
    echo "============="
    curl -s "${API_BASE}/queue-status" | jq '.' 2>/dev/null || curl -s "${API_BASE}/queue-status"
    echo ""
}

# Function to trigger recovery if needed
recovery_if_needed() {
    local health_response=$(curl -s "${API_BASE}/health")
    local whatsapp_ready=$(echo "$health_response" | jq -r '.whatsapp_ready' 2>/dev/null)
    
    if [ "$whatsapp_ready" = "false" ]; then
        echo "WhatsApp not ready, triggering recovery..."
        curl -s -X POST "${API_BASE}/recover-session" | jq '.' 2>/dev/null || curl -s -X POST "${API_BASE}/recover-session"
        echo ""
    fi
}

# Main monitoring
main() {
    echo "$(date): Starting monitoring check" >> $LOGFILE
    
    # Basic endpoint checks
    check_endpoint "/health" "Health endpoint"
    check_endpoint "/queue-status" "Queue status endpoint"
    
    echo ""
    
    # Get detailed information
    get_health_details
    get_queue_status
    
    # Auto-recovery if needed
    recovery_if_needed
    
    echo "$(date): Monitoring check completed" >> $LOGFILE
}

# Handle arguments
case "$1" in
    "watch")
        echo "Starting continuous monitoring (press Ctrl+C to stop)..."
        while true; do
            clear
            main
            echo "Next check in 30 seconds..."
            sleep 30
        done
        ;;
    "health")
        get_health_details
        ;;
    "queue")
        get_queue_status
        ;;
    "recover")
        echo "Triggering manual recovery..."
        curl -s -X POST "${API_BASE}/recover-session" | jq '.' 2>/dev/null || curl -s -X POST "${API_BASE}/recover-session"
        ;;
    "clear-queue")
        echo "Clearing message queue..."
        curl -s -X POST "${API_BASE}/clear-queue" | jq '.' 2>/dev/null || curl -s -X POST "${API_BASE}/clear-queue"
        ;;
    *)
        main
        echo ""
        echo "Usage:"
        echo "  $0          - Run single check"
        echo "  $0 watch    - Continuous monitoring"
        echo "  $0 health   - Show health details only"
        echo "  $0 queue    - Show queue status only"
        echo "  $0 recover  - Trigger manual recovery"
        echo "  $0 clear-queue - Clear message queue"
        ;;
esac