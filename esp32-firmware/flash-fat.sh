#!/bin/sh
set -Eeuo pipefail

dd if=/dev/zero of=fat.img bs=1K count=1344

mformat -i fat.img ::
mcopy -i fat.img fat/* ::
mdir -i fat.img ::

# Remember to check that partitions align
espflash partition-table partitions.csv

espflash write-bin -B 921600 0x2b0000 -p /dev/cu.usbmodem101 fat.img

rm fat.img
