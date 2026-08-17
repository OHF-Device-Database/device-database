# Device Database

The Device Database collects anonymous device telemetry from [Home Assistant](https://www.home-assistant.io/) installations. Home Assistant instances periodically submit snapshots describing their devices and entities. The system ingests, deduplicates, and aggregates this data so the community can see which devices are in use across the ecosystem.

## How it works

Home Assistant installations send periodic snapshots to the server. Each snapshot says "here are all the devices and entities I have right now." The server stores everything in two SQLite databases:

- **Staging DB** (write-heavy) -- raw storage. Every submission is kept with full detail, but devices and entities that already exist are not duplicated.
- **Derived DB** (read-optimized) -- rebuilt from staging every few minutes. Collapses all the detail down into simple counts like "how many installations use this device?"

```
Home Assistant  --POST snapshot-->  Server  --write-->  Staging DB (raw)
                                                               |
                                                        every 2-30 min
                                                               |
                                                               v
                          Web UI  <--read--           Derived DB (counts)
```

## Concepts

The data model has a few layers. Each layer adds detail on top of the previous one, and everything is deduplicated so the same thing is only stored once.

```
Device                    "What is it?"
  integration = hue         identified by integration +
  manufacturer = Philips    manufacturer + model + model_id
  model = Hue White
  model_id = LWA001
  |
  +-- Permutation           "What version is it running?"
  |     sw = 1.88.1           same device, different firmware
  |     hw = v1.0             or config = different permutation
  |     entry_type = service
  |     |
  |     +-- Entity Set        "What does it expose?"
  |           hash = ae3f...    a bundle of entities, identified
  |           |                 by a SHA-256 hash of its members
  |           +-- Entity: light
  |           +-- Entity: binary_sensor (connectivity)
  |
  +-- Permutation
        sw = 1.93.7          another user has the same device
        hw = v1.0             but newer firmware
        |
        +-- Entity Set
              hash = ae3f...  same entities, so the set is reused
```

### Device

A device is a unique thing in the real world: a light bulb, a sensor, a bridge. It is identified by four fields: **integration**, **manufacturer**, **model**, and **model_id**. If two installations report the same four values, they are talking about the same device. One row, no duplicates.

### Device permutation

The same device can show up with different firmware versions, hardware revisions, or entry types across installations (or even across updates on the same installation). Each unique combination of those fields is a **permutation**. This lets us track how many people run which firmware without losing the link to the parent device.

Permutations can also form parent-child hierarchies through `via_device`. For example, a Zigbee bulb connects *via* a Zigbee coordinator bridge -- that relationship is stored as a link between two permutations.

### Entity

An entity is something a device exposes to Home Assistant: a `light`, a `sensor`, a `binary_sensor`, etc. Entities are identified by their domain and a handful of properties (device class, unit of measurement, category, etc.). Like devices, they are deduplicated globally.

### Entity set

Instead of linking each entity to each permutation individually (which would create a huge number of rows), entities are grouped into **sets**. A set is identified by the SHA-256 hash of its sorted member IDs. If two permutations expose the exact same entities, they share the same set. This is the main trick that keeps storage manageable.

### Submission

A submission is a single snapshot from a Home Assistant installation. It records a timestamp, the Home Assistant version, and which devices/permutations/entity sets were observed. The link between a submission and the things it observed is stored in lightweight **attribution tables** -- one per concept (device, permutation, entity set). Deleting a submission cascades through all its attributions automatically.

### Derived data

The derived database is what the public API and web UI read from. It is rebuilt from staging on a schedule:

| What | Refresh | Description |
|---|---|---|
| Subjects | ~10 min | Active installations and their submission streaks |
| Devices | ~30 min | Unique installation count per device |
| Submissions | ~2 min | Submission counts grouped by HA version and completion state |

Blacklisted integrations and invalid manufacturers are filtered out during derivation.

### Example

Two Home Assistant installations submit snapshots:

**Subject A** has a Philips Hue bridge and bulb:
```
Device: (hue, Philips, Hue Bridge, BSB002)
  +-- Permutation: (entry_type=service, sw=1.55.0, hw=v2.1)
       +-- Entity Set [hash=abc123]:
            +-- Entity: (domain=light, device_class=null, unit=null)
            +-- Entity: (domain=binary_sensor, device_class=connectivity, unit=null)

Device: (hue, Philips, Hue White, LWA001)
  +-- Permutation: (entry_type=service, sw=1.88.1, hw=v1.0)
       +-- Entity Set [hash=def456]:
            +-- Entity: (domain=light, device_class=null, unit=null)

Link: Bridge-permutation --> Bulb-permutation (via_device)
```

**Subject B** has the same bulb model but newer firmware:
```
Device: (hue, Philips, Hue White, LWA001)       <-- same device row as Subject A
  +-- Permutation: (entry_type=service, sw=1.93.7, hw=v1.0)   <-- NEW permutation (different sw)
       +-- Entity Set [hash=def456]:             <-- REUSED (same entities)
            +-- Entity: (domain=light, ...)      <-- REUSED
```

After derivation, `derived_device` for `(hue, Philips, Hue White, LWA001)` shows `count=2` (two unique subjects).

## Architecture

C4 architecture diagrams are in [docs/architecture/](docs/architecture/) using [LikeC4](https://likec4.dev/) format. Install the [LikeC4 VS Code extension](https://marketplace.visualstudio.com/items?itemName=likec4.likec4-vscode) to preview diagrams directly in the editor, or paste them into the [playground](https://playground.likec4.dev/).

## Prerequisites

* [Node.js](https://nodejs.org/en/download/current) >= 24.0
* [Git Large File Storage](https://git-lfs.com/)
* `sqlc`

  Due to upstream moving a bit slow lately, we are using a [fork](https://github.com/OHF-Device-Database/sqlc) with a bunch of SQLite-related fixups.
  Install [Go](https://go.dev/doc/install) and run `make install-dependency-sqlc` to get everything configured (`GOPATH` is set to `.ephemeral/go`, global installs of `sqlc` remain untouched).

  We use a custom [WASM codegen plugin](https://docs.sqlc.dev/en/latest/guides/plugins.html#wasm-plugins) (`tool/sqlc-generate-typescript-plugin`) to generate ergonomic query types. A `wasm32-wasip1` Rust toolchain is required to build the plugin, but the plugin itself is also checked into LFS.

## Running

### Development

1. Install dependencies: `npm install` in `schema/` and `project/server/`
2. Build the OpenAPI schema: `make --directory schema`
3. Start the server: `make --directory project/server start`

### Container

1. Build: `make --directory project/server -f make/ops.mk build-container`
2. Run: `make --directory project/server start-container` (exports required environment variables automatically)

## Common operations

### Adding an endpoint

1. Add your endpoint definition to the OpenAPI schema (`schema/spec/main.yaml`)
2. Build the schema: `make --directory schema`
3. Write a handler for your endpoint and prime it (`project/server/src/api/endpoint/`)
4. Import and use your endpoint (`project/server/src/api/index.ts`)

### Writing a database migration

1. Create a new migration file: `make --directory project/server migration-new`
2. Verify migrations and schema don't diverge: `make --directory project/server migration-diff`

## License

[Apache-2.0](LICENSE)
