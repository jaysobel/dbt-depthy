import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Isolated depth calculation logic extracted from manifestParser.ts
interface TestDbtNode {
  unique_id: string;
  depends_on: {
    nodes: string[];
  };
  name: string;
  resource_type: string;
  package_name: string;
}

interface TestDbtManifest {
  nodes: {
    [key: string]: TestDbtNode;
  };
  child_map: {
    [key: string]: string[];
  };
  parent_map: {
    [key: string]: string[];
  };
}

// Isolated depth calculation function (extracted from manifestParser.ts)
function calculateModelDepths(manifest: TestDbtManifest): Map<string, number> {
  const modelDepths = new Map<string, number>();

  // Get all models from the manifest
  const models: { name: string, id: string }[] = [];
  
  for (const [id, node] of Object.entries(manifest.nodes)) {
    if (node.resource_type === 'model') {
      models.push({ 
        name: node.name,
        id: id 
      });
    }
  }

  // Build dependency graph (parents for each node)
  const parentGraph: Map<string, string[]> = new Map();
  const childGraph: Map<string, string[]> = new Map();
  
  for (const model of models) {
    const parents = (manifest.parent_map && manifest.parent_map[model.id]) || [];
    
    // Only include parent models, not sources or other node types
    const parentModels = parents.filter(parent => 
      parent.startsWith('model.')
    );
    
    parentGraph.set(model.id, parentModels);
    
    // Build reverse graph for topological sort
    for (const parent of parentModels) {
      if (!childGraph.has(parent)) {
        childGraph.set(parent, []);
      }
      childGraph.get(parent)!.push(model.id);
    }
    
    if (!childGraph.has(model.id)) {
      childGraph.set(model.id, []);
    }
  }

  // Calculate depths using topological sort approach for longest paths
  const depths = new Map<string, number>();
  const inDegree = new Map<string, number>();
  
  // Initialize depths and in-degrees
  for (const model of models) {
    const modelParents = parentGraph.get(model.id) || [];
    // Models that only depend on sources (no model dependencies) start at depth 1
    // Models that depend on other models start at depth 0 and will be calculated
    depths.set(model.id, modelParents.length === 0 ? 1 : 0);
    inDegree.set(model.id, modelParents.length);
  }
  
  // Queue for nodes with no model dependencies (only depend on sources)
  const queue: string[] = [];
  for (const model of models) {
    if (inDegree.get(model.id) === 0) {
      queue.push(model.id);
    }
  }
  
  // Process nodes in topological order
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDepth = depths.get(currentId)!;
    
    // Update depths of children (nodes that depend on this one)
    const children = childGraph.get(currentId) || [];
    for (const childId of children) {
      // Set depth to maximum of current depth or (parent depth + 1)
      const newDepth = Math.max(depths.get(childId)!, currentDepth + 1);
      depths.set(childId, newDepth);
      
      // Decrease in-degree and add to queue if all dependencies processed
      const newInDegree = inDegree.get(childId)! - 1;
      inDegree.set(childId, newInDegree);
      
      if (newInDegree === 0) {
        queue.push(childId);
      }
    }
  }

  // Store the calculated depths
  for (const model of models) {
    const depth = depths.get(model.id)!;
    modelDepths.set(model.name, depth);
    modelDepths.set(model.id, depth);
  }

  return modelDepths;
}

describe('Manifest Parser Logic (Isolated)', () => {
  describe('Manifest Parsing', () => {
    it('should handle valid manifest.json parsing', () => {
      const validManifest: TestDbtManifest = {
        nodes: {
          'model.test.staging_users': {
            unique_id: 'model.test.staging_users',
            name: 'staging_users',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['source.test.raw_users'] }
          }
        },
        child_map: {
          'source.test.raw_users': ['model.test.staging_users'],
          'model.test.staging_users': []
        },
        parent_map: {
          'model.test.staging_users': ['source.test.raw_users']
        }
      };

      const depths = calculateModelDepths(validManifest);
      assert.strictEqual(depths.get('staging_users'), 1);
    });

    it('should handle empty manifest', () => {
      const emptyManifest: TestDbtManifest = {
        nodes: {},
        child_map: {},
        parent_map: {}
      };

      const depths = calculateModelDepths(emptyManifest);
      assert.strictEqual(depths.get('any_model'), undefined);
    });

    it('should filter models from other node types', () => {
      const manifestWithMixedNodes: TestDbtManifest = {
        nodes: {
          'model.test.staging_users': {
            unique_id: 'model.test.staging_users',
            name: 'staging_users',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: [] }
          },
          'test.test.test_staging_users': {
            unique_id: 'test.test.test_staging_users',
            name: 'test_staging_users',
            resource_type: 'test',
            package_name: 'test',
            depends_on: { nodes: ['model.test.staging_users'] }
          },
          'source.test.raw_users': {
            unique_id: 'source.test.raw_users',
            name: 'raw_users',
            resource_type: 'source',
            package_name: 'test',
            depends_on: { nodes: [] }
          }
        },
        child_map: {
          'model.test.staging_users': ['test.test.test_staging_users'],
          'test.test.test_staging_users': [],
          'source.test.raw_users': ['model.test.staging_users']
        },
        parent_map: {
          'model.test.staging_users': ['source.test.raw_users'],
          'test.test.test_staging_users': ['model.test.staging_users']
        }
      };

      const depths = calculateModelDepths(manifestWithMixedNodes);

      // Only models should have depths calculated
      assert.strictEqual(depths.get('staging_users'), 1);
      assert.strictEqual(depths.get('test_staging_users'), undefined);
      assert.strictEqual(depths.get('raw_users'), undefined);
    });

    it('should handle model name resolution', () => {
      const manifest: TestDbtManifest = {
        nodes: {
          'model.analytics.staging_users': {
            unique_id: 'model.analytics.staging_users',
            name: 'staging_users',
            resource_type: 'model',
            package_name: 'analytics',
            depends_on: { nodes: [] }
          }
        },
        child_map: {
          'model.analytics.staging_users': []
        },
        parent_map: {
          'model.analytics.staging_users': []
        }
      };

      const depths = calculateModelDepths(manifest);

      // Should be able to find by short name
      assert.strictEqual(depths.get('staging_users'), 1);
      // Should also be able to find by full ID
      assert.strictEqual(depths.get('model.analytics.staging_users'), 1);
    });
  });

  describe('DAG Depth Calculation', () => {
    it('should calculate maximum depth (longest path) correctly', () => {
      const testManifest: TestDbtManifest = {
        nodes: {
          'model.test.staging_model': {
            unique_id: 'model.test.staging_model',
            name: 'staging_model',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['source.test.source_table'] }
          },
          'model.test.intermediate_model': {
            unique_id: 'model.test.intermediate_model',
            name: 'intermediate_model',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['model.test.staging_model'] }
          },
          'model.test.final_model': {
            unique_id: 'model.test.final_model',
            name: 'final_model',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['model.test.intermediate_model', 'model.test.another_staging'] }
          },
          'model.test.another_staging': {
            unique_id: 'model.test.another_staging',
            name: 'another_staging',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['source.test.another_source'] }
          }
        },
        child_map: {
          'source.test.source_table': ['model.test.staging_model'],
          'model.test.staging_model': ['model.test.intermediate_model'],
          'model.test.intermediate_model': ['model.test.final_model'],
          'source.test.another_source': ['model.test.another_staging'],
          'model.test.another_staging': ['model.test.final_model'],
          'model.test.final_model': []
        },
        parent_map: {
          'model.test.staging_model': ['source.test.source_table'],
          'model.test.intermediate_model': ['model.test.staging_model'],
          'model.test.final_model': ['model.test.intermediate_model', 'model.test.another_staging'],
          'model.test.another_staging': ['source.test.another_source']
        }
      };

      const depths = calculateModelDepths(testManifest);

      assert.strictEqual(depths.get('staging_model'), 1);
      assert.strictEqual(depths.get('intermediate_model'), 2);
      assert.strictEqual(depths.get('another_staging'), 1);
      assert.strictEqual(depths.get('final_model'), 3);
    });

    it('should handle complex dependency graph', () => {
      // Create a complex manifest instead of loading from fixture
      const complexManifest: TestDbtManifest = {
        nodes: {
          'model.test.staging_users': {
            unique_id: 'model.test.staging_users',
            name: 'staging_users',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['source.test.raw_users'] }
          },
          'model.test.staging_orders': {
            unique_id: 'model.test.staging_orders',
            name: 'staging_orders',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['source.test.raw_orders'] }
          },
          'model.test.intermediate_user_orders': {
            unique_id: 'model.test.intermediate_user_orders',
            name: 'intermediate_user_orders',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['model.test.staging_users', 'model.test.staging_orders'] }
          },
          'model.test.dim_users': {
            unique_id: 'model.test.dim_users',
            name: 'dim_users',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['model.test.staging_users'] }
          },
          'model.test.fct_orders': {
            unique_id: 'model.test.fct_orders',
            name: 'fct_orders',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: ['model.test.intermediate_user_orders', 'model.test.dim_users'] }
          }
        },
        child_map: {
          'source.test.raw_users': ['model.test.staging_users'],
          'source.test.raw_orders': ['model.test.staging_orders'],
          'model.test.staging_users': ['model.test.intermediate_user_orders', 'model.test.dim_users'],
          'model.test.staging_orders': ['model.test.intermediate_user_orders'],
          'model.test.intermediate_user_orders': ['model.test.fct_orders'],
          'model.test.dim_users': ['model.test.fct_orders'],
          'model.test.fct_orders': []
        },
        parent_map: {
          'model.test.staging_users': ['source.test.raw_users'],
          'model.test.staging_orders': ['source.test.raw_orders'],
          'model.test.intermediate_user_orders': ['model.test.staging_users', 'model.test.staging_orders'],
          'model.test.dim_users': ['model.test.staging_users'],
          'model.test.fct_orders': ['model.test.intermediate_user_orders', 'model.test.dim_users']
        }
      };

      const depths = calculateModelDepths(complexManifest);

      // Verify depths according to the complex fixture structure
      assert.strictEqual(depths.get('staging_users'), 1);
      assert.strictEqual(depths.get('staging_orders'), 1);
      assert.strictEqual(depths.get('dim_users'), 2);
      assert.strictEqual(depths.get('intermediate_user_orders'), 2);
      assert.strictEqual(depths.get('fct_orders'), 3);
    });
  });

  describe('Error Handling', () => {
    it('should handle manifest with missing parent_map', () => {
      const incompleteManifest = {
        nodes: {
          'model.test.staging_users': {
            unique_id: 'model.test.staging_users',
            name: 'staging_users',
            resource_type: 'model',
            package_name: 'test',
            depends_on: { nodes: [] }
          }
        },
        child_map: {},
        // parent_map is missing
      } as any;

      // Should not throw error
      assert.doesNotThrow(() => {
        calculateModelDepths(incompleteManifest);
      });
    });
  });
});