#!/bin/sh
set -Eeuo pipefail

set -a
source .env
set +a

cargo build -r

espflash save-image --chip esp32c6 target/riscv32imac-unknown-none-elf/release/door-entry-firmware ota.img

curl -X POST --data-binary @ota.img http://$ESP32_IP/update

rm ota.img
