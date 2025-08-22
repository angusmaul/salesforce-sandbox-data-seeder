#!/bin/bash

# Helper script for pm:sync command

# Update a file's GitHub URL in frontmatter
update_github_url() {
    local file="$1"
    local url="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Update github field
    sed -i "s|github: .*|github: $url|" "$file"
    
    # Add or update the updated field if it exists
    if grep -q "^updated:" "$file"; then
        sed -i "s|^updated: .*|updated: $timestamp|" "$file"
    else
        # Add updated field after created field
        sed -i "/^created:/a updated: $timestamp" "$file"
    fi
    
    # Add or update last_sync field
    if grep -q "^last_sync:" "$file"; then
        sed -i "s|^last_sync: .*|last_sync: $timestamp|" "$file"
    else
        # Add last_sync field after updated field
        sed -i "/^updated:/a last_sync: $timestamp" "$file"
    fi
}

# Main sync logic
if [ "$1" == "update_url" ]; then
    update_github_url "$2" "$3"
fi