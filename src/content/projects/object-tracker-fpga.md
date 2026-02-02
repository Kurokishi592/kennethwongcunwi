---
title: "Object Tracker with FPGA"
subtitle: "EE2026: Using a single Basys3 FPGA to make an object tracker with full GUI for user customisation."
date: "EE2026"
tags: ["FPGA", "Basys3", "UFDS", "GUI", "Verilog"]
thumbnail: "/assets/images/thumb-fpga-tracker.svg"
featured: true
---

## Draft notes (WIP)

These are my working notes as I build the tracker. The goal is a single-board pipeline with a settings GUI that helps users learn how image processing and connected-components labeling work.

## Variables / registers / memories

Variables are labeled memory spaces (registers, LUTRAM, BRAM). Treat them like global storage: you can read/write whenever the label is referenced.

```verilog
// LUTRAM
(* ram_style = "distributed" *) reg [x_bitsize-1:0] x;
(* ram_style = "distributed" *) reg [y_bitsize-1:0] y;

// registers
reg [16:0] ua_area_new;
reg [16:0] best_area;
reg [label_bits-1:0] best_lbl;
```

## Wires

Wires connect registers/inputs/outputs. When the RHS changes, the LHS signal reflects it immediately (combinational).

```verilog
wire [label_bits-1:0] left_label = (x == 0) ? 0 :
                                  (toggle_line == 0) ? row1_labels[x-1] : row0_labels[x-1];

wire [label_bits-1:0] up_label = (y == 0) ? 0 :
                                (toggle_line == 0) ? row0_labels[x] : row1_labels[x];

output wire ready_to_read;
assign ready_to_read = (state == S_READY);
```

## “Functions” via FSM

In FPGA designs, “functions” are commonly implemented as FSM states that pass control across clock cycles.

```verilog
reg [4:0] state;
localparam S_RESET = 0;
localparam S_INIT_LINES = 1;
localparam S_INIT_UFDS = 2;
localparam S_READY = 3;
localparam S_SAMPLE = 4;
localparam S_ADVANCE = 26;
```

## UFDS for object/blob detection (high level)

- Process a 1-bit bitmap stream in raster order.
- Use reduced neighborhood (L, UL, U, UR) for 8-connectivity.
- Maintain parent/rank + per-component statistics (area, min/max x/y, sums) online.
- Output up to top-N bounding boxes (and optionally centroids).
