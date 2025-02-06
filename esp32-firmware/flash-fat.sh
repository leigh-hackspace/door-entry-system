#!/bin/sh
set -Eeuo pipefail

dd if=/dev/zero of=fat.img bs=1K count=1984

mformat -i fat.img ::
mcopy -i fat.img fat/* ::
mdir -i fat.img ::

espflash write-bin -B 921600 0x210000 -p /dev/cu.usbserial-0001 fat.img

rm fat.img
