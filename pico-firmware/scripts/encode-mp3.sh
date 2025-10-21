#!/usr/bin/env bash

ffmpeg -i file.wav -ar 22050 -ac 1 -sample_fmt s16 -b:a 64k -af "apad=pad_dur=1" file.mp3
