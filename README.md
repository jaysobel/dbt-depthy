# dbt Depthy

A VSCode extension that adds a depth indicator to references within model files:

```
select *
from {{ ref('fct_orders') }} (9) --<-- overlay character added by this extension
```

DAG depth is taken as the longest path between a source model and the referenced model.

```
stg_orders (1) -> int_orders_feature (2) -> fct_orders (3)
```

## Extension Settings

This extension contributes the following settings:

* `dbtDepthy.manifestPath`: Path to the manifest.json file relative to the project root (default: "target/manifest.json")
* `dbtDepthy.mediumDepthThreshold`: Threshold for medium depth (default: 3)
* `dbtDepthy.highDepthThreshold`: Threshold for high depth (default: 8)
* `dbtDepthy.colorLowDepth`: Color for low depth dependencies (default: green)
* `dbtDepthy.colorMediumDepth`: Color for medium depth dependencies (default: yellow)
* `dbtDepthy.colorHighDepth`: Color for high depth dependencies (default: red)

You may need to run `dbt compile` for changes to take effect.

## Development

A `CLAUDE.md` is provided to jump start development with Claude Code. This extension was developed almost exclusively with Claude Code.