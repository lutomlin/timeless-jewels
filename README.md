# timeless-jewels [![push](https://github.com/Vilsol/timeless-jewels/actions/workflows/push.yml/badge.svg)](https://github.com/Vilsol/timeless-jewels/actions/workflows/push.yaml) ![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/vilsol/timeless-jewels) ![GitHub tag (latest by date)](https://img.shields.io/github/v/tag/vilsol/timeless-jewels) [![GitHub license](https://img.shields.io/github/license/Vilsol/timeless-jewels)](https://github.com/Vilsol/timeless-jewels/blob/master/LICENSE)

A simple timeless jewel calculator with a skill tree view

Hosted Version: [https://vilsol.github.io/timeless-jewels](https://vilsol.github.io/timeless-jewels)

Uses data extracted with https://github.com/Vilsol/go-pob-data

## Updates to new leagues

Whenever a new league is coming, the passive tree might get updated.
**But** it is not guaranteed to contain correct data until a game download is available.

Specifically, this project depends on the following data tables:

* Alternate Passive Additions
* Alternate Passive Skills
* Passive Skills
* Stats
* Translations

##

### Build/Run instructions:

First, do the WASM build to make the Go layer for RNG generation:

```
GOOS=js GOARCH=wasm go build -o frontend/static/calculator.wasm ./wasm
```

Next, make sure pnpm/Node.js are installed, and install required dependencies:

```
cd frontend && pnpm install
```

Then run the Svelte UI (from the `frontend` directory):

```
pnpm dev
```

## Pulling in new data

Copy across data extracted with https://github.com/Vilsol/go-pob-data into the `data` folder.
Once you've moved the files over, run:

```
python python generate_possible_stats.json.gz.py
```

to re-generate possible_stats JSON from scratch. Then re-run the WASM build, as above, and restart the Svelte server.

Commit every copied file that is changed; delete every file that is new - unless there is new data being added for a new feature.
