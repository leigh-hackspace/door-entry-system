#!/bin/sh
set -Eeuo pipefail

set -a
source .env
set +a

cargo build -r

espflash save-image --chip esp32 target/xtensa-esp32-none-elf/release/async_main ota.img

curl -X POST --data-binary @ota.img http://$ESP32_IP/update

rm ota.img
