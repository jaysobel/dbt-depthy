# DBT Dependency Depth Visualizer Extension

This is a VSCode Project. The point of the project is to add a little annotation to projects using the dbt framework.

The little annotation is specifically a little bubble appearing after a dbt ref like `{{ ref('model_name') }}` the bubble will appear inline as a non-text element and look like a little bubble: ( 3 ) where the number represents the DAG depth of the referenced model.

This requires maintaining the depth of every dbt model in the project. I've included the entirety of the dbt Power User Extension which already has this ability, for reference. However this reference material will be removed before we go to production, so this must be a stand-alone extension.

This annotation will only occur in `.sql` files in the `models/**/*.sql` directories of the dbt project.

### 1. Dependency Information Source
We'll need to access the model dependency information. The existing dbt Power User extension by AltimateAI (included in the repo) already has this functionality. It likely reads from:
- `manifest.json` - Created during `dbt compile`, contains the full DAG information
- `catalog.json` - Contains information about the physical representations of models

## Commands for Development
- `npm run watch` - Compile and watch for changes
- `F5` in VSCode - Launch extension in debug mode
- `dbt compile` - Generate the manifest.json for testing

## Notes
- We'll borrow concepts from dbt Power User but implement our own standalone code
- Focus on making the visualization intuitive and helpful for developers
- Consider performance for large DBT projects