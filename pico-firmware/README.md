                                   |    |
                            =======|    |=======
                        TX  | GP0         VBUS |
                        RX  | GP1         VSYS |
                            | GND          GND |
       (green white)    CS  | GP2           EN |
       (green)         SCK  | GP3         3_3V |
       (blue white)   MOSI  | GP4         VREF |
       (blue)         MISO  | GP5         GP28 |
                            | GND          GND |
                      DATA  | GP6         GP27 |
                       CLK  | GP7         GP26 |
                       LRC  | GP8          RUN |
                    WS2812  | GP9         GP22 |
                            | GND          GND |
OLD    (green)         SCK  | GP10        GP21 |  NIC
OLD    (blue white)   MOSI  | GP11        GP20 |  NIC
OLD    (blue)         MISO  | GP12        GP19 |  NIC
OLD    (green white)    CS  | GP13        GP18 |  NIC
                            | GND          GND |  NIC
                    BUTTON  | GP14        GP17 |  NIC
                      DOOR  | GP15        GP16 |  NIC
                            =====|        |=====
                                 |        |

Re-attach console:
  
    probe-rs attach --chip RP235x target/thumbv8m.main-none-eabihf/release/pico-2-embassy-test
