#!/bin/sh
set -Eeuo pipefail

set -a
source .env
set +a

# export PATH=~/Library/xPacks/@xpack-dev-tools/riscv-none-elf-gcc/14.2.0-3.1/.content/bin/:$PATH

# riscv-none-elf-gcc ffi/ctest.c -c
# riscv-none-elf-ar rcs libctest.a ctest.o

cargo build -r

espflash partition-table partitions.csv

espflash erase-parts -c esp32c6 --partition-table partitions.csv -p /dev/cu.usbmodem101 otadata
# espflash erase-parts -c esp32c6 --partition-table partitions.csv -p /dev/cu.usbmodem101 ota_1

espflash flash --partition-table partitions.csv -s 4mb -B 921600 -p /dev/cu.usbmodem101 --monitor target/riscv32imac-unknown-none-elf/release/door-entry-firmware
