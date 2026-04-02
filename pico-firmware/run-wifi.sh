#!/usr/bin/env bash

set -o allexport
source .env
set +o allexport

cargo run -r --bin pico-firmware --features=wifi
