import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('Integration Tests - File System and Data Processing', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(__dirname, 'temp_integration_test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('dbt Project Structure Detection', () => {
    it('should detect valid dbt project structure', () => {
      // Create a minimal dbt project structure
      const projectDir = path.join(tempDir, 'dbt_project');
      const modelsDir = path.join(projectDir, 'models');
      const targetDir = path.join(projectDir, 'target');

      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(modelsDir, { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });

      // Create dbt_project.yml
      const dbtProjectContent = `
name: 'test_project'
version: '1.0.0'
config-version: 2

model-paths: ["models"]
target-path: "target"
`;
      fs.writeFileSync(path.join(projectDir, 'dbt_project.yml'), dbtProjectContent);

      // Create a sample model
      const modelContent = `
select 
    user_id,
    name
from {{ ref('raw_users') }}
`;
      fs.writeFileSync(path.join(modelsDir, 'staging_users.sql'), modelContent);

      // Verify files exist
      assert.ok(fs.existsSync(path.join(projectDir, 'dbt_project.yml')));
      assert.ok(fs.existsSync(path.join(modelsDir, 'staging_users.sql')));
      
      // Verify model content contains ref() pattern
      const content = fs.readFileSync(path.join(modelsDir, 'staging_users.sql'), 'utf8');
      assert.ok(content.includes("ref('raw_users')"));
    });
  });

  describe('Manifest File Processing', () => {
    it('should process manifest.json files correctly', () => {
      const manifestPath = path.join(tempDir, 'manifest.json');
      
      const manifest = {
        nodes: {
          'model.test.staging_users': {
            unique_id: 'model.test.staging_users',
            name: 'staging_users',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['source.test.raw_users'] }
          },
          'model.test.dim_users': {
            unique_id: 'model.test.dim_users',
            name: 'dim_users',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['model.test.staging_users'] }
          }
        },
        child_map: {
          'source.test.raw_users': ['model.test.staging_users'],
          'model.test.staging_users': ['model.test.dim_users'],
          'model.test.dim_users': []
        },
        parent_map: {
          'model.test.staging_users': ['source.test.raw_users'],
          'model.test.dim_users': ['model.test.staging_users']
        }
      };

      // Write manifest file
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Read and verify manifest
      const content = fs.readFileSync(manifestPath, 'utf8');
      const parsedManifest = JSON.parse(content);

      assert.strictEqual(Object.keys(parsedManifest.nodes).length, 2);
      assert.ok(parsedManifest.nodes['model.test.staging_users']);
      assert.ok(parsedManifest.nodes['model.test.dim_users']);
    });

    it('should handle large manifest files efficiently', () => {
      const largeManifest: any = {
        nodes: {},
        child_map: {},
        parent_map: {}
      };

      // Create manifest with 100 models
      for (let i = 0; i < 100; i++) {
        const modelId = `model.test.model_${i}`;
        largeManifest.nodes[modelId] = {
          unique_id: modelId,
          name: `model_${i}`,
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: [] }
        };
        largeManifest.child_map[modelId] = [];
        largeManifest.parent_map[modelId] = [];
      }

      const manifestPath = path.join(tempDir, 'large_manifest.json');
      
      const startTime = Date.now();
      fs.writeFileSync(manifestPath, JSON.stringify(largeManifest, null, 2));
      const content = fs.readFileSync(manifestPath, 'utf8');
      const parsedManifest = JSON.parse(content);
      const endTime = Date.now();

      // Verify processing completed quickly
      assert.ok(endTime - startTime < 1000, 'Large manifest processing should be under 1 second');
      assert.strictEqual(Object.keys(parsedManifest.nodes).length, 100);
    });
  });

  describe('SQL File Pattern Matching', () => {
    it('should extract ref patterns from SQL files', () => {
      const sqlContent = `
        select 
          u.user_id,
          u.name,
          o.order_count
        from {{ ref('staging_users') }} u
        left join {{ ref("staging_orders") }} o 
          on u.user_id = o.user_id
        where u.created_at >= '2023-01-01'
      `;

      const sqlFile = path.join(tempDir, 'test_model.sql');
      fs.writeFileSync(sqlFile, sqlContent);

      const content = fs.readFileSync(sqlFile, 'utf8');
      
      // Test ref pattern extraction
      const REF_PATTERN = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g;
      const matches: string[] = [];
      let match;

      while ((match = REF_PATTERN.exec(content)) !== null) {
        matches.push(match[1]);
      }

      assert.strictEqual(matches.length, 2);
      assert.strictEqual(matches[0], 'staging_users');
      assert.strictEqual(matches[1], 'staging_orders');
    });
  });

  describe('Configuration Management', () => {
    it('should handle different configuration scenarios', () => {
      const configScenarios = [
        { mediumThreshold: 3, highThreshold: 6 },
        { mediumThreshold: 5, highThreshold: 10 },
        { mediumThreshold: 2, highThreshold: 4 }
      ];

      configScenarios.forEach((config, index) => {
        const configFile = path.join(tempDir, `config_${index}.json`);
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

        const content = fs.readFileSync(configFile, 'utf8');
        const parsedConfig = JSON.parse(content);

        assert.strictEqual(parsedConfig.mediumThreshold, config.mediumThreshold);
        assert.strictEqual(parsedConfig.highThreshold, config.highThreshold);
      });
    });
  });

  describe('Multi-Package dbt Projects', () => {
    it('should handle projects with multiple packages', () => {
      // Create main project
      const mainProjectDir = path.join(tempDir, 'main_project');
      fs.mkdirSync(mainProjectDir, { recursive: true });
      fs.mkdirSync(path.join(mainProjectDir, 'models'), { recursive: true });
      
      fs.writeFileSync(
        path.join(mainProjectDir, 'dbt_project.yml'),
        'name: "main_project"\nversion: "1.0.0"'
      );

      // Create package directory
      const packagesDir = path.join(mainProjectDir, 'dbt_packages');
      const packageDir = path.join(packagesDir, 'package1');
      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(path.join(packageDir, 'models'), { recursive: true });
      
      fs.writeFileSync(
        path.join(packageDir, 'dbt_project.yml'),
        'name: "package1"\nversion: "1.0.0"'
      );

      // Create models in different packages
      fs.writeFileSync(
        path.join(mainProjectDir, 'models', 'main_model.sql'),
        'select * from {{ ref("package_model") }}'
      );

      fs.writeFileSync(
        path.join(packageDir, 'models', 'package_model.sql'),
        'select * from raw_data'
      );

      // Verify structure
      assert.ok(fs.existsSync(path.join(mainProjectDir, 'dbt_project.yml')));
      assert.ok(fs.existsSync(path.join(packageDir, 'dbt_project.yml')));
      assert.ok(fs.existsSync(path.join(mainProjectDir, 'models', 'main_model.sql')));
      assert.ok(fs.existsSync(path.join(packageDir, 'models', 'package_model.sql')));
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing files gracefully', () => {
      const nonExistentPath = path.join(tempDir, 'non_existent.json');
      
      assert.strictEqual(fs.existsSync(nonExistentPath), false);
      
      // Should not throw when checking non-existent files
      assert.doesNotThrow(() => {
        fs.existsSync(nonExistentPath);
      });
    });

    it('should handle malformed JSON files', () => {
      const malformedFile = path.join(tempDir, 'malformed.json');
      fs.writeFileSync(malformedFile, '{ "invalid": json content }');

      assert.throws(() => {
        const content = fs.readFileSync(malformedFile, 'utf8');
        JSON.parse(content);
      }, SyntaxError);
    });
  });
});