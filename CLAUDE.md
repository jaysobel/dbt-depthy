# DBT Dependency Depth Visualizer Extension

This is a VSCode Project. The point of the project is to add a little annotation bubble within the SQL code of projects that use the dbt framework.

The little annotation appears after every instance of a dbt ref, which looks like `{{ ref('model_name') }}` and the bubble contains a number, indicating the 'DAG depth' of the referenced model (`model_name`) within the dbt DAG.

This requires maintaining data the depth of every dbt model in the project. 

This data will be drawn from the project `manifest.json` file which contains information about dbt models and how they associate with one another.

This annotation will only occur in `.sql` files in the `models/**/*.sql` directories of the dbt project.

### DAG Depth Source
We'll need to access the model dependency information.
- `manifest.json` - Created during `dbt compile`, contains the full DAG information
- `catalog.json` - Contains information about the physical representations of models

## Commands for Development
- `npm run watch` - Compile and watch for changes
- `F5` in VSCode - Launch extension in debug mode
- `dbt compile` - Generate the manifest.json for testing

## Notes
- Focus on making the visualization intuitive and helpful for developers
- Consider performance for large DBT projects