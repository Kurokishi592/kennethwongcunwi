---
title: "Coupling Effect: Problem of Yaw value changing when rolling or pitching"
description: "Debugging log: coupling, tilt compensation, and why atan2(magX, magY) can betray you."
pubDate: 2025-02-28
tags: ["Sensor Fusion", "IMU", "Debugging"]
---

## Problem and Context

While developing my sensors board for HornetX programme, a phenomenon was discovered: When I roll or pitch it, roll and pitch readings are clean and stable (no drift), yet yaw values changes even though I did not yaw the board.

## Observation

- Roll/pitch look accurate and not drifting.
- Yaw changes as roll/pitch changes (coupled).
- The coupling is asymmetric: some directions behave “more correct” than others.

## What we tried (and what we learned)

1. **Mag recalibration (outside, minimal interference)**
2. **Tilt compensation using accel + magnetometer projection** (and trying Madgwick gravity)
3. **3×3 rotation matrix** to decouple magnetometer under roll/pitch
4. **Switching away from Madgwick for yaw** (Kalman-style fusion)
5. **Suspected overdamping / tuning issues**

## Working hypothesis

Yaw is typically computed from $\operatorname{atan2}(m_y, m_x)$. But roll/pitch can change the magnetometer’s horizontal components even if the board isn’t yawed. So “yaw changes when I roll/pitch” can be a frame/coupling issue rather than a yaw rotation.

## Snippet (tilt-compensated magnetometer yaw)

```c
// Compute yaw using tilt-compensated magnetometer
// roll = phi (rad), pitch = theta (rad)

float cosPhi = cos(roll);
float sinPhi = sin(roll);
float cosTheta = cos(pitch);
float sinTheta = sin(pitch);

float mX_rot = magX * cosTheta + magZ * sinTheta;
float mY_rot = magX * sinPhi * sinTheta + magY * cosPhi - magZ * sinPhi * cosTheta;

float yaw = atan2(mY_rot, mX_rot) * 180.0f / M_PI;
```

## TODO

- Export the referenced screenshots and add them under `/assets/images/`.
- Add a short “final takeaway” once the quaternion/rotation approach is fully validated.
