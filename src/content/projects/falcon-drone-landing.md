---
title: "FALCON — Dynamic Drone Landing Simulator"
subtitle: "AprilTags + sensor fusion + PID control, packaged as a modular library with a Python GUI."
date: "May 2025 – Jul 2025"
tags: ["Computer Vision", "Sensor Fusion", "PID", "Python"]
thumbnail: "/assets/images/thumb-falcon.svg"
featured: false
---

## Overview

FALCON is a vision-based dynamic drone landing system that allows Unmanned Aerial Vehicles (UAVs) to land autonomously on moving platforms. It presents users with a Python-based GUI that abstracts backend algorithms for users to adapt FALCON’s capabilities into any drone, fine tune parameters and simulate in real time. At its core, FALCON uses AprilTags for real-time visual localization, sensor fusion for motion estimation, and a Proportional-Integral-Derivative (PID) controller with noise filtering for precise trajectory correction. As a modular and reusable software library, FALCON aims to be easily extensible for all users with various hardware and thus benefit the open-source robotics ecosystem.

This project achieved the Apollo 11 (Advanced) level under the NUS Orbital (CP2106: Independent Software Development Project), which is the School of Computing’s 1st year summer self-directed, independent work course.. This course exposes students to pick up software development skills on their own, and complete a small scale software project of their choice in an iterative software development life cycle. This is on top of the robotics-related skills applied to enhance this project's capabilities.

## Highlights

- AprilTag detection for relative pose.
- Sensor fusion and control loop tuning.
- GUI tooling for reproducible testing.

# My thoughts
This project idea was inspired by one of RobotX 2024's tasks that required an Unmanned Aerial Vehicle (UAV) to land autonomously on an Autonomous Surface Vessel (ASV).

Building up perception for autonomous manoeuvring fascinates me. This was how I leverage this academic platform to explore visual fudicials, localisation and controls. 

>[!note] TODO: complete this write up
>- What I learnt from AprilTag algorithm (v1 to v3 papers - recursive tag, optimisations, union find, etc)
>- QGC, Pixhawk -> MiniAUV Project
>- Simple UIUX


						     +--------------------+
					         |    QGroundControl  |
		                     | (Mission Planning) |
		                     +---------+----------+
                                       |
                                MAVLink Protocol
                                       |
	                +------------------▼------------------+
                    |        Pixhawk 6X Flight Controller |
                    | (Handles motor control, telemetry,  |
                    |  and safety failsafes)              |
                    +------------------▲------------------+
                                       |
                           Sensor Data / Flight Commands
                                       |
                    +--------------------+--------------------+
                    |             Raspberry Pi 4B             |
                    |         (Main onboard computer)         |
	                +--------------------+--------------------+
                                         |
   +------------------+------------------+------------------+------------------+
   |                  |                  |                  |                  |
   ▼                  ▼                  ▼                  ▼                  ▼
+----------+   +-----------+      +------------+      +-----------+    +----------+
| OpenCV + |   | Sensor    |      |  Control   |      | Dockerized|    |Logging & |
| AprilTag |   |(IMU)      |      |  PID +     |      | Container |    |Visual    |
|Detection |   |           |      |  Kalman    |      | Env       |    |Matplotlib|
|          |   |           |      |            |      |           |    |          |
+----------+   +-----------+      +------------+      +-----------+    +----------+
   +------------------+------------------+------------------+------------------+
             |                 |                         |          |
             |                 +----------+--------------+          |
             |                            |                         |
             ▼                            ▼                         ▼
       AprilTag Position             IMU Data Stream            User Tuning
         (Image Frames)             (Accel, Gyro, Mag)       (PID Gains, Logs,)
             |                            |                         |
 +------------+    +----------+----------+       +------+-----------+
              ▼    ▼                     ▼       ▼                  ▼
    Sensor Fusion Layer        Trajectory Prediction      Logging & Playback
    (Kalman Filter)             (Estimates platform        (Saves telemetry,
                              motion from tag data)     visual graphs, etc.)

          +---------------------------+       +---------------------------+
          |     Command Output        |       |     Visualization UI      |
          | (Sends control signals to |       | (Plots, telemetry, status |
          | Pixhawk via ESP32 + MAVLink)      |  display via Tkinter)     |
          +---------------------------+       +---------------------------+