import * as assert from 'assert';

// Test just the depth calculation logic in isolation
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
    const parents = manifest.parent_map[model.id] || [];
    
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

describe('DAG Depth Calculation (Isolated)', () => {
  it('should calculate maximum depth (longest path) correctly', () => {
    // Create a test manifest with the following DAG structure:
    // source_table (depth 0)
    //   ↓
    // staging_model (depth 1)
    //   ↓
    // intermediate_model (depth 2)
    //   ↓
    // final_model (depth 3)
    //
    // Additionally:
    // another_source (depth 0)
    //   ↓
    // another_staging (depth 1) 
    //   ↓ ↘
    //      final_model (should still be depth 3, taking the longest path)

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

    // Verify the depths are calculated correctly (longest path)
    assert.strictEqual(depths.get('staging_model'), 1, 'staging_model should have depth 1');
    assert.strictEqual(depths.get('intermediate_model'), 2, 'intermediate_model should have depth 2');
    assert.strictEqual(depths.get('another_staging'), 1, 'another_staging should have depth 1');
    assert.strictEqual(depths.get('final_model'), 3, 'final_model should have depth 3 (longest path)');
  });

  it('should handle models with no dependencies', () => {
    // Test case with a model that has no parent dependencies (source model)
    const testManifest: TestDbtManifest = {
      nodes: {
        'model.test.source_model': {
          unique_id: 'model.test.source_model',
          name: 'source_model',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: [] }
        },
        'model.test.child_model': {
          unique_id: 'model.test.child_model',
          name: 'child_model',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: ['model.test.source_model'] }
        }
      },
      child_map: {
        'model.test.source_model': ['model.test.child_model'],
        'model.test.child_model': []
      },
      parent_map: {
        'model.test.source_model': [],
        'model.test.child_model': ['model.test.source_model']
      }
    };

    const depths = calculateModelDepths(testManifest);

    assert.strictEqual(depths.get('source_model'), 1, 'source_model should have depth 1 (depends only on sources)');
    assert.strictEqual(depths.get('child_model'), 2, 'child_model should have depth 2');
  });

  it('should handle diamond dependency pattern correctly', () => {
    // Test diamond pattern:
    //     base (depth 0)
    //    ↙    ↘
    // left(1) right(1)
    //    ↘    ↙
    //     final (depth 2)
    const testManifest: TestDbtManifest = {
      nodes: {
        'model.test.base': {
          unique_id: 'model.test.base',
          name: 'base',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: [] }
        },
        'model.test.left': {
          unique_id: 'model.test.left',
          name: 'left',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: ['model.test.base'] }
        },
        'model.test.right': {
          unique_id: 'model.test.right',
          name: 'right',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: ['model.test.base'] }
        },
        'model.test.final': {
          unique_id: 'model.test.final',
          name: 'final',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: ['model.test.left', 'model.test.right'] }
        }
      },
      child_map: {
        'model.test.base': ['model.test.left', 'model.test.right'],
        'model.test.left': ['model.test.final'],
        'model.test.right': ['model.test.final'],
        'model.test.final': []
      },
      parent_map: {
        'model.test.base': [],
        'model.test.left': ['model.test.base'],
        'model.test.right': ['model.test.base'],
        'model.test.final': ['model.test.left', 'model.test.right']
      }
    };

    const depths = calculateModelDepths(testManifest);

    assert.strictEqual(depths.get('base'), 1, 'base should have depth 1 (depends only on sources)');
    assert.strictEqual(depths.get('left'), 2, 'left should have depth 2');
    assert.strictEqual(depths.get('right'), 2, 'right should have depth 2');
    assert.strictEqual(depths.get('final'), 3, 'final should have depth 3');
  });

  it('should handle multiple paths of different lengths correctly', () => {
    // Test case where one model can be reached via multiple paths of different lengths:
    // short_path: a (0) → target (1)
    // long_path:  b (0) → c (1) → d (2) → target (3)
    // target should have depth 3 (longest path)
    const testManifest: TestDbtManifest = {
      nodes: {
        'model.test.a': {
          unique_id: 'model.test.a',
          name: 'a',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: [] }
        },
        'model.test.b': {
          unique_id: 'model.test.b',
          name: 'b',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: [] }
        },
        'model.test.c': {
          unique_id: 'model.test.c',
          name: 'c',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: ['model.test.b'] }
        },
        'model.test.d': {
          unique_id: 'model.test.d',
          name: 'd',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: ['model.test.c'] }
        },
        'model.test.target': {
          unique_id: 'model.test.target',
          name: 'target',
          resource_type: 'model',
          package_name: 'test',
          depends_on: { nodes: ['model.test.a', 'model.test.d'] }
        }
      },
      child_map: {
        'model.test.a': ['model.test.target'],
        'model.test.b': ['model.test.c'],
        'model.test.c': ['model.test.d'],
        'model.test.d': ['model.test.target'],
        'model.test.target': []
      },
      parent_map: {
        'model.test.a': [],
        'model.test.b': [],
        'model.test.c': ['model.test.b'],
        'model.test.d': ['model.test.c'],
        'model.test.target': ['model.test.a', 'model.test.d']
      }
    };

    const depths = calculateModelDepths(testManifest);

    assert.strictEqual(depths.get('a'), 1, 'a should have depth 1 (depends only on sources)');
    assert.strictEqual(depths.get('b'), 1, 'b should have depth 1 (depends only on sources)');
    assert.strictEqual(depths.get('c'), 2, 'c should have depth 2');
    assert.strictEqual(depths.get('d'), 3, 'd should have depth 3');
    assert.strictEqual(depths.get('target'), 4, 'target should have depth 4 (longest path)');
  });
});