#!/usr/bin/env bash
# Use the same reproducible setup/build path as the primary local launcher.
exec bash "$(dirname "$0")/dev.sh" "$@"
