## structure

```
├── schemas
│   ├── trait.json
│   └── policy.json
├── entities
│   ├── brands
│   │   ├── 41
│   │   │   └── 42
│   │   │       ├── 41423942-68d6-4498-866b-79ea0e174db9
│   │   │       │   └── name
│   │   │       │       └── value.json
│   │   │       └── 41424e61-876b-406b-93e7-476fb00eb747
│   │   │           └── name
│   │   │               └── value.json
│   │   └── 52
│   │       └── 2f
│   │           └── 522f6647-40a2-475c-ba32-8c3dd554c0f5
│   │               ├── alias-of -> ../../../41/42/41423942-68d6-4498-866b-79ea0e174db9
│   │               └── name
│   │                   └── value.json
│   ├── categories
│   │   ├── climate-control
│   │   │   ├── categories
│   │   │   │   ├── air-conditioner
│   │   │   │   │   ├── highlights
│   │   │   │   │   ├── matter-device-types
│   │   │   │   │   │   └── value.json
│   │   │   │   │   └── name
│   │   │   │   │       └── en
│   │   │   │   │           └── value.json
│   │   │   │   ├── fan
│   │   │   │   │   ├── matter-device-types
│   │   │   │   │   │   └── value.json
│   │   │   │   │   └── name
│   │   │   │   │       └── en
│   │   │   │   │           └── value.json
│   │   │   │   └── hvac
│   │   │   │       ├── matter-device-types
│   │   │   │       │   └── value.json
│   │   │   │       └── name
│   │   │   │           └── en
│   │   │   │               └── value.json
│   │   │   └── name
│   │   │       └── en
│   │   │           └── value.json
│   │   ├── entertainment
│   │   │   ├── categories
│   │   │   │   └── tv
│   │   │   │       ├── matter-device-types
│   │   │   │       │   └── value.json
│   │   │   │       └── name
│   │   │   │           └── en
│   │   │   │               └── value.json
│   │   │   └── name
│   │   │       └── en
│   │   │           └── value.json
│   │   ├── lighting
│   │   │   ├── highlights
│   │   │   │   └── ordered
│   │   │   │       ├── 1 -> ../../../../../traits/devices/fitting
│   │   │   │       └── 2 -> ../../../../../traits/devices/brightness
│   │   │   ├── matter-device-types
│   │   │   │   └── value.json
│   │   │   └── name
│   │   │       └── en
│   │   │           └── value.json
│   │   └── power-and-energy
│   │       ├── matter-device-types
│   │       │   └── value.json
│   │       └── name
│   │           └── en
│   │               └── value.json
│   └── devices
│       ├── 45
│       │   └── d6
│       │       ├── 45d6565b-b3ee-412d-8e43-f74e34222d50
│       │       │   ├── brand -> ../../../../brands/41/42/41423942-68d6-4498-866b-79ea0e174db9
│       │       │   ├── categories
│       │       │   │   └── ordered
│       │       │   │       └── 1 -> ../../../../../../categories/lighting
│       │       │   ├── images
│       │       │   │   ├── ordered
│       │       │   │   │   └── 1 -> ../originals/side.png
│       │       │   │   └── originals
│       │       │   │       └── side.png
│       │       │   └── name
│       │       │       └── value.json
│       │       └── 45d6718c-bb96-4a86-b646-94418980cb88
│       │           ├── brand -> ../../../../brands/41/42/41423942-68d6-4498-866b-79ea0e174db9
│       │           ├── categories
│       │           │   └── ordered
│       │           │       ├── 1 -> ../../../../../../categories/climate-control/categories/air-conditioner
│       │           │       └── 2 -> ../../../../../../categories/climate-control/categories/fan
│       │           ├── images
│       │           │   ├── ordered
│       │           │   │   ├── 1 -> ../originals/cover.png
│       │           │   │   └── 2 -> ../originals/side.jpeg
│       │           │   └── originals
│       │           │       ├── cover.png
│       │           │       └── side.jpeg
│       │           ├── name
│       │           │   └── value.json
│       │           └── overview
│       │               └── en
│       │                   └── value.json
│       └── eb
│           └── 23
│               └── eb23a53a-e447-4f8d-8755-68ab6c6307d2
│                   ├── brand -> ../../../../brands/52/2f/522f6647-40a2-475c-ba32-8c3dd554c0f5
│                   ├── categories
│                   │   └── ordered
│                   │       └── 1 -> ../../../../../../categories/climate-control
│                   ├── duplicate-of -> ../../../45/d6/45d6565b-b3ee-412d-8e43-f74e34222d50
│                   ├── images
│                   │   ├── ordered
│                   │   │   └── 1 -> ../originals/cover.jpeg
│                   │   └── originals
│                   │       └── cover.jpeg
│                   └── name
│                       └── value.json
├── policies
│   ├── default
│   │   └── definition.json
│   └── strict
│       └── definition.json
└── traits
    ├── brands
    │   ├── alias-of
    │   │   ├── definition.json
    │   │   ├── locale
    │   │   │   └── en.json
    │   │   └── policy.json -> ../../../policies/default/definition.json
    │   └── name
    │       ├── definition.json
    │       ├── locale
    │       │   └── en.json
    │       └── policy.json -> ../../../policies/default/definition.json
    ├── categories
    │   ├── name
    │   │   ├── definition.json
    │   │   ├── locale
    │   │   │   └── en.json
    │   │   └── policy.json -> ../../../policies/default/definition.json
    │   ├── matter-device-types
    │   │   ├── definition.json
    │   │   ├── locale
    │   │   │   └── en.json
    │   │   └── policy.json -> ../../../policies/strict/definition.json
    │   └── highlights
    │       ├── definition.json
    │       ├── locale
    │       │   └── en.json
    │       └── policy.json -> ../../../policies/default/definition.json
    └── devices
        ├── overview
        │   ├── definition.json
        │   ├── locale
        │   │   └── en.json
        │   └── policy.json -> ../../../policies/strict/definition.json
        ├── brand
        │   ├── definition.json
        │   ├── locale
        │   │   └── en.json
        │   └── policy.json -> ../../../policies/default/definition.json
        ├── categories
        │   ├── definition.json
        │   ├── locale
        │   │   └── en.json
        │   └── policy.json -> ../../../policies/default/definition.json
        ├── duplicate-of
        │   ├── definition.json
        │   ├── locale
        │   │   └── en.json
        │   └── policy.json -> ../../../policies/default/definition.json
        ├── fitting
        │   ├── definition.json
        │   ├── locale
        │   │   └── en.json
        │   └── policy.json -> ../../../policies/default/definition.json
        ├── brightness
        │   ├── definition.json
        │   ├── locale
        │   │   └── en.json
        │   └── policy.json -> ../../../policies/default/definition.json
        ├── images
        │   ├── definition.json
        │   ├── locale
        │   │   └── en.json
        │   └── policy.json -> ../../../policies/default/definition.json
        └── name
            ├── definition.json
            ├── locale
            │   └── en.json
            └── policy.json -> ../../../policies/default/definition.json
```

## traits

planned device traits, each living at `traits/devices/<id>/` with `definition.json`, `locale/en.json` and `policy.json -> ../../../policies/default/definition.json`

- ids are kebab-case like every other directory name, option ids as well
- min / max pairs are folded into `range` traits, except where only an upper bound exists
- "empty" / "unsupported" means the trait is absent, i.e. no value
- `definition.json` holds type, unit, bounds and option ids, `locale/en.json` holds label, description and option titles

| planned type                   | definition                                           | layout |
| ------------------------------ | ---------------------------------------------------- | ------ |
| boolean                        | `toggle`                                             | value  |
| decimal                        | `number`                                             | value  |
| integer                        | `number`, step `1`                                   | value  |
| min / max pair                 | `range`                                              | value  |
| enum                           | `picker`, resource `none`                            | value  |
| enum (multi)                   | `picker`, resource `none`, multiple                  | value  |
| text                           | `text`, single line                                  | value  |
| device / device set references | `picker`, resource `device` / `device-set`, multiple | links  |
| country codes                  | `picker`, resource `markets`, multiple               | links  |

```json
{
  "id": "color-temperature",
  "type": "range",
  "unit": "K",
  "pattern": {
    "bounds": {
      "min": 1000
    }
  }
}
```

### lighting

| id                  | label                   | description                                                                                                                                                             | definition                                                |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `brightness`        | Dimmable                | The light can be dimmed, not only switched on and off. Brightness can be set from Home Assistant, automations and scenes.                                               | toggle                                                    |
| `color-temperature` | Colour temperature      | The warmest and coolest white this light can produce, in Kelvin. Lower values give a cosy, candle-like light, higher values a crisp, daylight-like light.               | range · `K` · min `1000`                                  |
| `color-modes`       | Colour modes            | How the light represents colour. Lights with xy or hs modes show the full colour spectrum; rgbw and rgbww add dedicated white channels; white means tunable white only. | picker, multiple · `xy` `hs` `rgb` `rgbw` `rgbww` `white` |
| `effects`           | Light effects           | The light offers built-in effects such as colour loops, candle flicker or breathing, which can be started from Home Assistant.                                          | toggle                                                    |
| `transition`        | Transition time support | The light can fade smoothly between brightness or colour values over a chosen time instead of changing instantly.                                                       | toggle                                                    |

### switching

| id                  | label                             | description                                                                                                                                  | definition                  |
| ------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `on-off`            | On/off control                    | The device can be switched on and off remotely.                                                                                              | toggle                      |
| `power-on-behavior` | Power-on behaviour configurable   | You can choose what the device does after a power cut: switch on, stay off, or return to its previous state.                                 | toggle                      |
| `channels`          | Number of controlled channels     | The number of outputs this device controls independently, such as the gangs of a wall switch or the sockets of a power strip.                | number · step `1` · min `1` |
| `detached-mode`     | Decoupled or detached switch mode | The physical switch can be decoupled from the relay, so pressing it sends an event to Home Assistant instead of switching the load directly. | toggle                      |
| `max-load-current`  | Maximum switched load             | The highest current the switched output is rated for, in amperes. Check this against the appliance you plan to connect.                      | number · `A` · min `0`      |

### covers

| id                   | label                  | description                                                                                                      | definition                                                                                     |
| -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `cover-kind`         | Cover kind             | The kind of opening the device moves: a blind, curtain, roller shutter, awning, garage door, gate or similar.    | picker · `awning` `blind` `curtain` `damper` `door` `garage` `gate` `shade` `shutter` `window` |
| `cover-set-position` | Cover position control | The cover can be moved to an exact position, for example 40 percent open, rather than only fully open or closed. | toggle                                                                                         |
| `cover-tilt`         | Cover tilt control     | The slats or louvres can be tilted independently of the cover's open position.                                   | toggle                                                                                         |
| `cover-stop`         | Cover stop command     | Movement can be stopped halfway with a dedicated stop command.                                                   | toggle                                                                                         |

### locks

| id                       | label                       | description                                                                                        | definition |
| ------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| `credential-pin`         | PIN keypad                  | The lock can be opened with a PIN code entered on a keypad.                                        | toggle     |
| `credential-rfid`        | RFID credential             | The lock can be opened with RFID or NFC tags, cards or key fobs.                                   | toggle     |
| `credential-fingerprint` | Fingerprint credential      | The lock can be opened with a fingerprint reader.                                                  | toggle     |
| `credential-face`        | Face recognition credential | The lock can be opened by face recognition.                                                        | toggle     |
| `credential-aliro`       | Aliro credential            | The lock supports Aliro, the open standard for unlocking with a phone or watch held near the lock. | toggle     |
| `auto-lock`              | Auto-lock                   | The lock can relock itself automatically after a set time.                                         | toggle     |
| `unbolt`                 | Unlatch / unbolt (open)     | The lock can also pull the latch, so the door opens without turning a handle.                      | toggle     |
| `door-position-sensor`   | Door position sensor        | The lock reports whether the door itself is open or closed, not only whether it is locked.         | toggle     |
| `access-schedules`       | Access schedules            | Codes or credentials can be limited to specific days and times.                                    | toggle     |
| `event-logging`          | Access event logging        | The lock keeps a record of who locked or unlocked it and when.                                     | toggle     |

### climate

| id                      | label                                    | description                                                                                                                                                                 | definition                                               |
| ----------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `hvac-modes`            | HVAC modes                               | The operating modes this device offers, such as heating only, cooling only, dehumidifying or fan only. Automatic switching between heating and cooling is a separate trait. | picker, multiple · `heat` `cool` `auto` `dry` `fan-only` |
| `auto-changeover`       | Automatic heating and cooling changeover | Switches between heating and cooling by itself to hold a temperature range, with separate heating and cooling setpoints. Without it you choose heating or cooling by hand.  | toggle                                                   |
| `setpoint-range`        | Setpoint range                           | The lowest and highest target temperature you can set, in degrees Celsius.                                                                                                  | range · `°C`                                             |
| `setpoint-step`         | Setpoint step                            | The smallest step by which the target temperature can be adjusted, in degrees Celsius.                                                                                      | number · `°C`                                            |
| `presets`               | Preset modes (eco, away, comfort)        | Offers preset modes such as eco, away or comfort that switch the target temperature in one step.                                                                            | toggle                                                   |
| `schedule`              | Built-in weekly schedule                 | Has a built-in weekly schedule that keeps running even when Home Assistant is unavailable.                                                                                  | toggle                                                   |
| `window-open-detection` | Open-window detection                    | Detects a sudden temperature drop from an opened window and pauses heating to save energy.                                                                                  | toggle                                                   |
| `child-lock`            | Child lock                               | Physical controls can be locked so settings cannot be changed by accident or by children.                                                                                   | toggle                                                   |
| `external-sensor-input` | External temperature sensor input        | Can use a separate temperature sensor placed elsewhere in the room instead of its own built-in sensor.                                                                      | toggle                                                   |
| `humidity-setpoint`     | Humidity setpoint                        | A target humidity can be set in addition to, or instead of, a target temperature.                                                                                           | toggle                                                   |

### fans

| id                 | label                | description                                                                                       | definition                  |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- |
| `fan-speed-levels` | Fan speed levels     | The number of distinct fan speeds that can be selected. Empty means the fan has no speed control. | number · step `1` · min `1` |
| `fan-oscillation`  | Oscillation          | The fan can swing from side to side to spread airflow across the room.                            | toggle                      |
| `fan-direction`    | Reversible direction | The rotation direction can be reversed, for example to circulate warm air in winter.              | toggle                      |
| `fan-auto-mode`    | Automatic mode       | The fan adjusts its speed by itself based on air quality or temperature readings.                 | toggle                      |

### vacuums

| id                   | label                   | description                                                                                    | definition |
| -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| `mapping`            | Map building            | The robot builds and stores a map of your home, which is the basis for room and zone cleaning. | toggle     |
| `room-selection`     | Selective room cleaning | Individual rooms can be selected for cleaning from Home Assistant.                             | toggle     |
| `zone-cleaning`      | Zone cleaning           | A freely drawn area on the map can be cleaned on demand.                                       | toggle     |
| `mopping`            | Mopping                 | The robot can mop floors in addition to vacuuming.                                             | toggle     |
| `auto-empty`         | Auto-empty dock         | The dock empties the robot's dustbin automatically.                                            | toggle     |
| `auto-wash`          | Mop washing dock        | The dock washes and dries the mop pads automatically.                                          | toggle     |
| `carpet-detection`   | Carpet detection        | The robot recognises carpets and raises suction or lifts the mop accordingly.                  | toggle     |
| `obstacle-avoidance` | Obstacle avoidance      | The robot detects objects such as cables, shoes or pet waste and steers around them.           | toggle     |

### valves

| id                   | label                  | description                                                               | definition |
| -------------------- | ---------------------- | ------------------------------------------------------------------------- | ---------- |
| `valve-set-position` | Valve position control | The valve can be set to a partial opening, not only fully open or closed. | toggle     |

### media

| id                  | label                  | description                                                                                                                                                                                  | definition                                                                                                                         |
| ------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `volume-control`    | Volume control         | Volume and mute can be controlled from Home Assistant.                                                                                                                                       | toggle                                                                                                                             |
| `source-select`     | Input source selection | The active input, such as HDMI, optical or a streaming service, can be switched remotely.                                                                                                    | toggle                                                                                                                             |
| `playback-control`  | Playback control       | Play, pause and track skipping can be controlled from Home Assistant.                                                                                                                        | toggle                                                                                                                             |
| `grouping`          | Multi-room grouping    | Several speakers can be grouped to play the same audio in sync across rooms.                                                                                                                 | toggle                                                                                                                             |
| `casting-protocols` | Casting protocols      | The ways audio or video can be sent to the device from a phone, computer or Home Assistant, such as Google Cast or AirPlay. Needed for announcements and media playback from Home Assistant. | picker, multiple · `google-cast` `airplay` `airplay-2` `spotify-connect` `dlna-upnp` `miracast` `bluetooth-audio` `matter-casting` |
| `announce`          | Announcements / TTS    | Spoken announcements or text-to-speech messages can be played, pausing current playback and resuming afterwards.                                                                             | toggle                                                                                                                             |

### cameras

| id                 | label                          | description                                                                                                   | definition |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------- |
| `video-stream`     | Live video stream              | A live video feed can be viewed in Home Assistant.                                                            | toggle     |
| `two-way-audio`    | Two-way audio                  | You can listen and talk through the device, for example to speak with a visitor at the door.                  | toggle     |
| `snapshot`         | Snapshot capture               | Still images can be captured on demand, for example to attach to a notification.                              | toggle     |
| `night-vision`     | Night vision                   | The camera records usable images in the dark, usually with infrared illumination.                             | toggle     |
| `pan-tilt`         | Pan and tilt                   | The camera can be turned and tilted remotely to look around a room or yard.                                   | toggle     |
| `optical-zoom`     | Optical zoom                   | The lens can zoom in optically and keep detail, unlike digital zoom, which only crops the image.              | toggle     |
| `local-storage`    | Local recording storage        | Recordings can be stored on the device or on a local recorder instead of a cloud service.                     | toggle     |
| `privacy-mode`     | Privacy mode                   | Recording and streaming can be switched off, often with a physical shutter, when you want privacy at home.    | toggle     |
| `object-detection` | Person, vehicle, pet detection | The device recognises people, vehicles, animals or packages and can report them separately from plain motion. | toggle     |

### sirens

| id                   | label          | description                                                                                      | definition |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------ | ---------- |
| `siren-tone-presets` | Tone presets   | A choice of built-in alarm sounds, for example a chime for a doorbell and a siren for intrusion. | toggle     |
| `siren-custom-audio` | Custom audio   | Your own sounds can be uploaded or streamed to the device and used as alarm or chime tones.      | toggle     |
| `siren-volume`       | Volume control | The loudness of the alarm can be adjusted.                                                       | toggle     |
| `strobe`             | Strobe light   | The siren has a flashing light in addition to sound.                                             | toggle     |

### appliances

| id               | label                    | description                                                     | definition |
| ---------------- | ------------------------ | --------------------------------------------------------------- | ---------- |
| `remote-start`   | Remote start / stop      | Programs can be started, paused or stopped from Home Assistant. | toggle     |
| `program-select` | Program selection        | The washing, drying or cooking program can be chosen remotely.  | toggle     |
| `remaining-time` | Remaining time reporting | The device reports how long the current program still needs.    | toggle     |

### measurement

| id                    | label                           | description                                                                                                    | definition                                                                                                                                                                                                               |
| --------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `measured-quantities` | Measured quantities             | What the device measures, such as temperature, humidity, light level, air pressure, CO2 or particulate matter. | picker, multiple · `temperature` `humidity` `illuminance` `pressure` `co2` `voc` `pm1` `pm25` `pm10` `co` `formaldehyde` `radon` `sound-pressure` `moisture` (soil) `uv-index` `wind-speed` `precipitation` `water-flow` |
| `temperature-range`   | Temperature measurement range   | The lowest and highest temperature the sensor can measure, in degrees Celsius.                                 | range · `°C`                                                                                                                                                                                                             |
| `humidity-range`      | Humidity measurement range      | The lowest and highest relative humidity the sensor can measure, in percent.                                   | range · `%` · min `0` · max `100`                                                                                                                                                                                        |
| `illuminance-max`     | Illuminance measurement maximum | The highest light level the sensor can measure, in lux.                                                        | number · `lx` · min `0`                                                                                                                                                                                                  |
| `co2-range-max`       | CO2 measurement maximum         | The highest CO2 concentration the sensor can measure, in parts per million.                                    | number · `ppm` · min `0`                                                                                                                                                                                                 |

### energy

| id                        | label                     | description                                                                                                                                                    | definition                                                                                                                        |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `energy-metrics`          | Energy monitoring metrics | Which electrical values the device reports, such as power, energy, voltage, current or power factor. Per-phase devices report each of three phases separately. | picker, multiple · `power` `energy` `voltage` `current` `frequency` `power-factor` `produced-energy` `reactive-power` `per-phase` |
| `metering-accuracy-class` | Metering accuracy class   | How precise the energy readings are. Indicative values are fine for automations; a certified class is needed for billing or official reporting.                | picker · `indicative` `class-2` `class-1` `class-0-5` `mid-certified`                                                             |

### detection

| id                    | label                      | description                                                                                                                                                                | definition                                                                                                                                                     |
| --------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detected-conditions` | Detected conditions        | What the device detects, such as motion, presence, an open door or window, water leaks, smoke, gas or vibration.                                                           | picker, multiple · `motion` `occupancy` `presence` `door` `window` `opening` `moisture` `smoke` `gas` `co` `vibration` `tamper` `glass-break` `sound` `moving` |
| `sensing-technology`  | Sensing technology         | The technology used for detection, for example passive infrared, millimetre-wave radar or a camera. Radar sensors notice still people; infrared sensors react to movement. | picker, multiple · `pir` `mmwave-radar` `ultrasonic` `vision` `reed-contact` `hall-effect` `capacitive` `optical-smoke` `electrochemical`                      |
| `detection-zones`     | Detection zones or targets | The number of separate zones or people the sensor can tell apart. Empty means the sensor reports a single area only.                                                       | number · step `1` · min `0`                                                                                                                                    |

### controls

| id        | label                     | description                                                                                               | definition                                                                                     |
| --------- | ------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `actions` | Button and remote actions | The kinds of button presses the device reports, such as single, double or long press, or rotating a dial. | picker, multiple · `single` `double` `triple` `long` `release` `rotate` `shake` `flip` `slide` |
| `buttons` | Number of buttons         | The number of physical buttons on the device.                                                             | number · step `1` · min `1`                                                                    |

### power

| id                    | label               | description                                                                                                                                                              | definition                                                                             |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `power-source`        | Power source        | How the device is powered: mains, batteries, USB, Power over Ethernet or solar.                                                                                          | picker, multiple · `mains` `battery` `usb` `poe` `solar`                               |
| `battery-type`        | Battery type        | The battery form factor or chemistry the device uses, for example a coin cell, AA cells or a built-in lithium pack.                                                      | picker · `cr2032` `cr2450` `cr2477` `cr123a` `aa` `aaa` `9v` `li-ion` `lifepo4` `nimh` |
| `battery-quantity`    | Battery quantity    | How many batteries the device needs.                                                                                                                                     | number · step `1` · min `1`                                                            |
| `battery-replaceable` | Battery replaceable | Whether the battery can be swapped by the user, needs the device opened with tools, or cannot be replaced at all. Replaceable batteries keep a device useful for longer. | picker · `user-replaceable` `requires-disassembly` `not-replaceable`                   |
| `standby-power`       | Standby power       | Power drawn while idle, in watts. Lower is better for your energy bill and the environment.                                                                              | number · `W` · min `0`                                                                 |

### network

| id                 | label                  | description                                                                                                                                                                                         | definition                                                                                                                                                                                                                |
| ------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mesh-role`        | Mesh role              | The device's role in a Zigbee or Thread network. Routers and border routers extend the network; end devices only use it.                                                                            | picker · `end-device` `router` `coordinator` `border-router` `bridge`                                                                                                                                                     |
| `zwave-long-range` | Z-Wave Long Range      | The device supports Z-Wave Long Range, a star-topology mode with much greater reach than classic Z-Wave mesh, when paired with a compatible controller.                                             | toggle                                                                                                                                                                                                                    |
| `connectivity`     | Connectivity           | How the device connects: the radio or wire it uses, and for Matter and ESPHome the transport underneath. A device can have more than one, for example Bluetooth for setup and Thread for daily use. | picker, multiple · `zigbee` `zwave` `thread` `matter-over-wifi` `matter-over-thread` `matter-over-ethernet` `wifi` `ethernet` `poe` `bluetooth-le` `esphome` `infrared` `rf-433` `knx` `modbus-rs485` `dali` `cloud-only` |
| `requires-device`  | Required hub or bridge | The hub, bridge or controller this device needs to work. If several are listed, any one of them is enough.                                                                                          | picker, multiple · resource `device-set` / `device`                                                                                                                                                                       |
| `hub-required`     | Hub or bridge required | Whether the device needs a hub or bridge, or can be used on its own.                                                                                                                                | toggle                                                                                                                                                                                                                    |

### lifecycle

| id                     | label                         | description                                                                                                                                                                    | definition                                                                                                   |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `firmware-ota`         | Firmware updates over the air | The device's firmware can be updated over the air, with updates shown in Home Assistant.                                                                                       | toggle                                                                                                       |
| `end-of-life`          | End of life                   | The manufacturer no longer sells or supports this device.                                                                                                                      | toggle                                                                                                       |
| `community-maintained` | Community maintained          | The device keeps working through community-maintained firmware or integrations after the manufacturer stopped supporting it, for example Tasmota, ESPHome or OpenBeken builds. | toggle                                                                                                       |
| `successor-devices`    | Successor devices             | Devices the manufacturer or community recommends as replacements for this one.                                                                                                 | picker, multiple · resource `device`                                                                         |
| `references`           | Further references            | Links to read more about the device: manufacturer page, manual, community notes, firmware sources or reviews. Shown as the last section of the device page.                    | open, typed links · `manufacturer-page` `manual` `community-notes` `firmware-source` `review` `forum-thread` |

### physical

| id                   | label               | description                                                                                                                              | definition                                                                                                            |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fitting`            | Lamp fitting        | The lamp cap or socket type, such as E27, GU10 or B22. Integrated means the light source cannot be replaced.                             | picker · `e27` `e26` `e14` `e12` `b22` `gu10` `gu5-3` `g9` `g4` `gx53` `integrated`                                   |
| `plug-standard`      | Mains plug standard | The mains plug type the device ships with, using international plug letters, for example type F for most of Europe or type G for the UK. | picker, multiple · `type-a` `type-b` `type-c` `type-e` `type-f` `type-g` `type-i` `type-j` `type-d` `type-m` `type-n` |
| `ingress-protection` | Ingress protection  | The IP rating for protection against dust and water. IP44 suits sheltered outdoor use; IP65 and above withstand rain and jets.           | picker · `ip20` `ip44` `ip54` `ip55` `ip65` `ip66` `ip67` `ip68`                                                      |
| `placement`          | Placement           | Whether the device is intended for indoor use, outdoor use or both.                                                                      | picker · `indoor` `outdoor` `indoor-and-outdoor`                                                                      |
| `width-mm`           | Width               | Width of the device in millimetres.                                                                                                      | number · `mm` · min `0`                                                                                               |
| `height-mm`          | Height              | Height of the device in millimetres.                                                                                                     | number · `mm` · min `0`                                                                                               |
| `depth-mm`           | Depth               | Depth of the device in millimetres.                                                                                                      | number · `mm` · min `0`                                                                                               |
| `diameter-mm`        | Diameter            | Diameter of the lamp or round device in millimetres.                                                                                     | number · `mm` · min `0`                                                                                               |
| `length-mm`          | Length              | Length of the lamp or strip in millimetres.                                                                                              | number · `mm` · min `0`                                                                                               |
| `weight-g`           | Weight              | Weight of the device in grams.                                                                                                           | number · `g` · min `0`                                                                                                |

### certification

| id                            | label                        | description                                                                                                                                                                                                            | definition                                                                                                                  |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `wwha-certified`              | Works with Home Assistant    | The device is certified under the Works with Home Assistant program: tested for local control, firmware updates and a high-quality integration, with the manufacturer committed to privacy, choice and sustainability. | toggle                                                                                                                      |
| `wwha-certified-connectivity` | Certified connectivity       | The connection path the Works with Home Assistant certification covers. A device may be certified for one path, such as Matter over Thread, while other ways of connecting it are not certified.                       | picker, multiple · `zigbee` `matter-over-wifi` `matter-over-thread` `zwave` `esphome` `wifi` `bluetooth` `poe` `vendor-hub` |
| `matter-certificate-id`       | Matter certification         | The device holds a Matter certificate from the Connectivity Standards Alliance, which means it passed the official interoperability tests for the Matter standard.                                                     | text · e.g. `CSA26503MAT55891-24`                                                                                           |
| `zigbee-certificate-id`       | Zigbee certification         | The device holds a Zigbee certificate from the Connectivity Standards Alliance for the Zigbee 3.0 or Zigbee Home Automation program.                                                                                   | text · e.g. `ZIG<n>`                                                                                                        |
| `zwave-certificate-id`        | Z-Wave certification         | The device holds a Z-Wave Alliance certificate, which confirms it follows the Z-Wave specification and interoperates with other certified Z-Wave products.                                                             | text · e.g. `ZC14-26090640`                                                                                                 |
| `ecosystem-programs`          | Other certification programs | Other compatibility programs the device is certified under, such as Works with SmartThings, Works with Google Home, Apple Home or Alexa certified. These are separate from Home Assistant support.                     | picker, multiple · `works-with-smartthings` `works-with-google-home` `apple-home` `alexa-certified` `homey`                 |

### setup

| id                          | label                       | description                                                                                                                                                                     | definition                                                             |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `setup-requires-vendor-app` | Vendor app needed for setup | The manufacturer's own app is needed once, for pairing, calibration or activation, before the device can be used with Home Assistant. Day-to-day control does not need the app. | toggle                                                                 |
| `account-required`          | Manufacturer account needed | A manufacturer account must be created to set up or use the device, even when it is controlled locally afterwards.                                                              | toggle                                                                 |
| `requires-local-storage`    | Local storage needed        | Recordings or history need local storage such as a hub, NVR or SD card. Without it the device works only live, or needs the manufacturer's cloud.                               | toggle                                                                 |
| `hardware-prerequisite`     | Hardware prerequisite       | Something else you need to have for the device to work, for example a smart meter port, a specific power supply or a compatible light strip.                                    | text · e.g. `Norwegian HAN port`, `12 to 24 V DC supply`, `RGBW strip` |

### regions

| id                  | label            | description                                                                                                                                                                         | definition                            |
| ------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `regions-available` | Available in     | The markets where the manufacturer sells and supports this device. Radio frequencies and plugs differ by region, so a device bought elsewhere may not work or may not be certified. | picker, multiple · resource `markets` |
| `regions-excluded`  | Not available in | Markets explicitly excluded by the manufacturer, even inside a region that is otherwise covered.                                                                                    | picker, multiple · resource `markets` |

### open

- `references`: typed links (type + url) have no matching definition type yet
- `requires-device`: device sets are curated, named groups of devices (e.g. zigbee coordinators, hue bridge family, aqara hubs) maintained like categories → need their own entity kind, and the trait mixes references to sets and single devices
- `regions-available` / `regions-excluded`: `markets` needs a source, iso 3166-1 alpha-2 codes plus shorthands (`worldwide`, `europe` → eu and eea, `north-america` → us, ca, mx) expanding to code lists
- `cover-kind`: candidate for a second-level category under a cover category instead
- applicability of traits to categories (e.g. lock credentials only for locks) isn't modeled

## matter device types

categories list the matter device types belonging to them through the `matter-device-types` trait, which categorizes models of the dcl by their `deviceTypeID`.

`traits/categories/matter-device-types/definition.json`, static options → read from `value.json`

```json
{
  "id": "matter-device-types",
  "type": "picker",
  "resource": "none",
  "options": [
    { "id": "0x0023" },
    { "id": "0x0028" },
    { "id": "0x002b" },
    { "id": "0x0072" },
    { "id": "0x0100" },
    { "id": "0x0101" },
    { "id": "0x010c" },
    { "id": "0x010d" },
    { "id": "0x0300" },
    { "id": "0x0301" },
    { "id": "0x050c" },
    { "id": "0x050d" },
    { "id": "0x0510" }
  ],
  "pattern": {
    "multiple": true
  }
}
```

`traits/categories/matter-device-types/locale/en.json`, device type names are localized alongside the trait

```json
{
  "label": "Matter Device Types",
  "hint": "Matter device types belonging to this category",
  "description": "Device types of the matter device library, categorizing models listed in the distributed compliance ledger.",
  "options": {
    "0x0023": { "title": "Casting Video Player" },
    "0x0028": { "title": "Basic Video Player" },
    "0x002b": { "title": "Fan" },
    "0x0072": { "title": "Room Air Conditioner" },
    "0x0100": { "title": "On/Off Light" },
    "0x0101": { "title": "Dimmable Light" },
    "0x010c": { "title": "Color Temperature Light" },
    "0x010d": { "title": "Extended Color Light" },
    "0x0300": { "title": "Heating/Cooling Unit" },
    "0x0301": { "title": "Thermostat" },
    "0x050c": { "title": "EVSE" },
    "0x050d": { "title": "Device Energy Management" },
    "0x0510": { "title": "Electrical Sensor" }
  }
}
```

`entities/categories/lighting/matter-device-types/value.json`

```json
{
  "value": ["0x0100", "0x0101", "0x010c", "0x010d"],
  "source": { "kind": "database", "value": "csa" }
}
```

| category                                     | device types                           |
| -------------------------------------------- | -------------------------------------- |
| `climate-control/categories/air-conditioner` | `0x0072`                               |
| `climate-control/categories/fan`             | `0x002b`                               |
| `climate-control/categories/hvac`            | `0x0300`, `0x0301`                     |
| `entertainment/categories/tv`                | `0x0023`, `0x0028`                     |
| `lighting`                                   | `0x0100`, `0x0101`, `0x010c`, `0x010d` |
| `power-and-energy`                           | `0x050c`, `0x050d`, `0x0510`           |

- ids are lower-case, zero-padded hex as written in the matter specification
- device types are listed on the most specific category only, parents cover the device types of their children through `head_category.parent`
- a device type may be listed on more than one category, models of it then belong to each
- structural device types (root node `0x0016`, aggregator `0x000e`, ota provider `0x0014`, …) aren't listed, models declaring them stay uncategorized

```sql
select m.vid, m.pid, c.name as category
from external_dcl_model m
join head_category c on c.trait = 'matter-device-types' and c.locale is null
join json_each(c.value) t on t.value = printf('0x%04x', m.device_type_id);
```

## seeding

walking a repository from scratch through github's rest api, or the dcl ledger through an observer node, requires too many requests to do on demand. an index is therefore seeded offline, the sqlite database itself being the seed. both sources can be seeded into the same database.

### github

```sh
INDEX_GITHUB_TOKEN='<token>' make index-seed-github \
  INDEX_SEED_DATABASE='<path>/index.db' \
  INDEX_GITHUB_OWNER='<owner>' \
  INDEX_GITHUB_REPOSITORY='<repository>'
```

- optional: `INDEX_GITHUB_BRANCH` (default `main`), `INDEX_SEED_INTERVAL` milliseconds between requests (default `1000`)
- requests are serialized and spaced out, rate limits are waited out (`x-ratelimit-reset`, `retry-after`, exponential backoff otherwise)
- rerunning against an existing database resumes from its latest indexed commit
- commits are applied at once at the end of a run, an interrupted run loses its progress

### dcl

```sh
make index-seed-dcl INDEX_SEED_DATABASE='<path>/index.db'
```

- optional: `INDEX_DCL_URL` rest endpoint of a node (default public mainnet node `https://on.dcl.csa-iot.org`), `INDEX_SEED_INTERVAL` milliseconds between requests (default `500`)
- a full walk lists vendors, models and compliance, then fetches versions per model and each version individually, ~20k requests → hours
- the full walk isn't consistent to a single height, the script syncs a second time to pick up txs that landed during the walk
- rerunning against a seeded database only refetches entries touched by txs past its stored height
- the full walk is applied at once at the end of a run, an interrupted run loses its progress

### placing

- with the server stopped, place the database at `<DATABASE_DOMAIN_INDEX_PATH>/initial/db` before first start, the domain lays out `current -> initial` around it
- when `current` already points at a generation, replace the `db` within it instead, and remove stale `db-wal` / `db-shm`

### availability

#### github

- the index is available once `history` holds at least one commit
- unavailable → the github webhook answers `503`, nothing is synced
- available → synced on startup to pick up commits pushed in the meantime, and on every webhook delivery afterwards

#### dcl

- enabled through `INDEX_DCL_ENABLE` (default `false`), node set through `INDEX_DCL_URL` (default `https://on.dcl.csa-iot.org`), disabled → never synced
- available once `external_dcl_sync` holds its row, i.e. after a seed
- unavailable → the hourly sync is skipped with a warning
- available → synced hourly at `:30`, refetching entries touched by txs past the stored height

## export

derived devices are mapped onto the structure above, to be contributed to the repository.

```sh
make index-export \
  INDEX_EXPORT_DERIVED='<path>/derived.db' \
  INDEX_EXPORT_OUTPUT='<directory>'
```

- optional: `INDEX_EXPORT_INDEX` index database, `INDEX_EXPORT_INCLUDE_INDEXED=true` also exports what is indexed already
- devices present in `head_device` are left out, without an index nothing counts as indexed
- derived device ids are stable → used as device ids as is
- trait definitions and categories are seeded from `export/seed` (`traits/`, `policies/`, `entities/categories/`), traits present in `head_trait` are left out, policies only accompany the traits linking them
- seed leaves out `references`, `requires-device`, `regions-available` and `regions-excluded` (see [open](#open))

| trait          | derived from                                                                                                           | source         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------- |
| `name`         | `model` + `model_id`, `model` alone when it contains `model_id`                                                        | `ha-telemetry` |
| `brand`        | `manufacturer`, matched case-insensitively against brand names, otherwise uuid v5 of the name                          | link           |
| `duplicate-of` | `derived_device_id_canonical`                                                                                          | link           |
| `categories`   | `integration`, as derived devices are categorized (`categorized-integrations.json`)                                    | links          |
| `power-source` | `battery` sensor → `battery`, other sources aren't reported                                                            | `inferred`     |
| `firmware-ota` | `update` entity                                                                                                        | `inferred`     |
| `connectivity` | `integration`, only where its `ha_connectivity` (`categorized-integrations.json`) is a single transport with an option | `inferred`     |

- brands not matched are exported alongside with their `name`
- seed categories are exported along with their `name` (`en`, source `community`), those present in `head_category` are left out
- devices link the seed category matching the innermost segment of a category id, whether indexed or not
