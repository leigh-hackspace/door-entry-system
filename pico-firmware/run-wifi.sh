#!/usr/bin/env bash

set -o allexport
source .env
set +o allexport

cargo run -r --bin main --features=wifi
