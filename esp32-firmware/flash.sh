#!/bin/sh
set -Eeuo pipefail

set -a
source .env
set +a

xtensa-esp32-elf-gcc -mlongcalls ffi/ctest.c -c
xtensa-esp32-elf-ar rcs libctest.a ctest.o

cargo build -r

espflash partition-table partitions.csv

espflash erase-parts -c esp32 --partition-table partitions.csv -p /dev/cu.usbserial-0001 otadata
# espflash erase-parts -c esp32 --partition-table partitions.csv -p /dev/cu.usbserial-0001 ota_1

espflash flash --partition-table partitions.csv -s 4mb -B 921600 -p /dev/cu.usbserial-0001 --monitor target/xtensa-esp32-none-elf/release/async_main
