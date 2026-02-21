---
title: "Can CAN CAN?"
description: "CAN Protocol: What happens when CAN cannot CAN?"
pubDate: 2026-02-21
tags: ["SCAN Protocol", "Debugging", "Communications"]
---
CAN as a differential pair, so it is way more robust to noise. It is a multi-master-multi-slave bus communication.

### CAN GND
If CAN is differential, what is the point of CAN GND?

Ans: Theres a limit to how much actual potential difference can be between nodes.If theres no common gnd between 2 isolated nodes, one node when compared to average voltage (common mode voltage) of another node could be very big difference. The CAN GND is to keep the common mode voltage between nodes close to each other.

### Debugging CAN:
1. Check terminating resistors. Probing CANH and CANL (when not live) should be 60Ω since there are two 120Ω resistors on each ends of the CAN bus.
2. Check if CAN messages are sent onto the busline by using [CANable](https://canable.io/), a CAN-serial device, to read CANH CANL over serial port from your computer (easiest method)
3. Check if CAN messages are sent onto the busline by using a scope or logic analyser, such as a [Saleae](https://saleae.com/logic). This scopes the CANH and CANL lines such that a message frame worth of bits can be seen on the screen (highs and lows). Logic analysers can decode into the message itself too.
4. If sent from devices such as Jetson Orin, which uses CAN RX TX, a transceiver is needed. Debug by first testing if Jetson CAN controller is transmitting through `loopback`, perhaps from CAN0 to CAN1. Else, set up [mttcan](https://www.yumpu.com/en/document/read/26236190/download-m-ttcan-user-manual-bosch-semiconductors-and-) to read from kernel level the error messages and statuses. [Jetson CAN](https://github.com/hartkopp/nvidia-t18x-can?tab=readme-ov-file). If all seems good, check post trasceiver's CANH CANL output, using methods (1), (2) and/or (3). [Jetson AGX Xavier Canbus not working](https://forums.developer.nvidia.com/t/agx-xavier-canbus-not-working/180374)
5. If `format error` or `stuffing error` occurs, check source codes for how the CAN message and frame format is used by those devices. 

### Standard CAN vs Extended CAN:
Difference between CAN2.0A vs CAN 2.0B lies in the bit length of identifier ID field; Standard: 11bits, Extended: 29bits.

Arbitrated by the Frame Format bit.

Application: VESC6 (e.g. by flipsky) https://github.com/vedderb/bldc

https://vesc-project.com/sites/default/files/imce/u15301/VESC6_CAN_CommandsTelemetry.pdf
The VESCs uses extended ID frame when receiving commands and sending VESC status. However, they hijacked the extended identifier field and reformatted it. E.g., for sending duty cycles to VESCs, the first 11 bits are zeroed, Frame Type == 1 (extended), then first 8 bits of the next 19 bits is used for VESC ID, and next 3bits used for command identifiers. 
<figure>
  <img src="/assets/images/can.png" alt="VESC CAN Frame" />
  <figcaption>
    VESC CAN Frame
  </figcaption>
</figure>

### CAN standardisation:
Good idea to have an excel sheet that documents the following details for each message that exists on the CANbus (depends on implementation):
1. CANID (in DEC, HEX and Binary)
2. CANID Masks and Filters
3. CAN Header
4. Message Type (for users to know)
5. Source and Recipient (for users to know)
6. Data field (0-8 bytes)
7. Freq in Hz
8. Period in ms
9. Other comments