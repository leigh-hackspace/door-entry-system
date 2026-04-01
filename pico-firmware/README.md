# Raspberry Pi Pico 2 with W6100 Ethernet firmware

Wiring:

                                            |    |
                                     =======|    |=======
                                 TX  | GP0         VBUS |
                                 RX  | GP1         VSYS |
                                     | GND          GND |
        RFID    (green white)    CS  | GP2 CL        EN |
        RFID    (green)         SCK  | GP3 SI      3_3V |
        RFID    (blue white)   MOSI  | GP4 SO      VREF |
        RFID    (blue)         MISO  | GP5 CS      GP28 |  ???
                                     | GND          GND |
                               DATA  | GP6         GP27 |  ???
                                CLK  | GP7         GP26 |  ???
                                LRC  | GP8          RUN |
                             WS2812  | GP9         GP22 |  DOOR SENSOR
                                     | GND          GND |
         LCD    (green)         SCK  | GP10        GP21 |  NIC
         LCD    (blue white)   MOSI  | GP11        GP20 |  NIC
         LCD    (blue)         MISO  | GP12        GP19 |  NIC
         LCD    (green white)    CS  | GP13        GP18 |  NIC
                                     | GND          GND |  NIC
                             BUTTON  | GP14        GP17 |  NIC
                            MAGLOCK  | GP15        GP16 |  NIC
                                     =====|        |=====
                                          |        |

GPIO 10,11,12,13 reserved for potentially adding an LCD display.

Building:

    export WIFI_NETWORK=Leighhack
    export WIFI_PASSWORD=caffeine1234

    ./run-wired.sh
    ./run-wifi.sh

Re-attach console:

    ./attach.sh
