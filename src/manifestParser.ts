import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Types to represent the structure of the manifest.json file
interface DbtNode {
  unique_id: string;
  depends_on: {
    nodes: string[];
  };
  name: string;
  resource_type: string;
  package_name: string;
}

interface DbtManifest {
  nodes: {
    [key: string]: DbtNode;
  };
  child_map: {
    [key: string]: string[];
  };
  parent_map: {
    [key: string]: string[];
  };
}

export class DbtManifestParser {
  private manifest: DbtManifest | null = null;
  private _modelDepths: Map<string, number> = new Map();
  private _onManifestUpdated: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onManifestUpdated: vscode.Event<void> = this._onManifestUpdated.event;

  constructor() {
    // Initialize the parser
  }

  /**
   * Gets the depth of a model in the DAG
   * @param modelName The model name to look up
   * @returns The depth of the model, or undefined if not found
   */
  public getModelDepth(modelName: string): number | undefined {
    // First try by model name only
    const depth = this._modelDepths.get(modelName);
    if (depth !== undefined) {
      return depth;
    }

    // If not found, it might be fully qualified, try to find it by iterating through all model names
    for (const [key, value] of this._modelDepths.entries()) {
      if (key.endsWith(`.${modelName}`)) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Refreshes the manifest data from the file system
   */
  public async refreshManifest(): Promise<void> {
    try {
      const manifestPath = await this.findManifestFile();
      if (!manifestPath) {
        console.log('Manifest file not found');
        return;
      }

      console.log(`Loading manifest from: ${manifestPath}`);
      const content = fs.readFileSync(manifestPath, 'utf8');
      this.manifest = JSON.parse(content) as DbtManifest;
      
      // Calculate model depths
      this.calculateModelDepths();
      
      // Notify listeners that the manifest has been updated
      this._onManifestUpdated.fire();
    } catch (error) {
      console.error('Error refreshing manifest:', error);
      vscode.window.showErrorMessage(`Error refreshing dbt manifest: ${error}`);
    }
  }

  /**
   * Finds the manifest.json file in the workspace
   */
  private async findManifestFile(): Promise<string | undefined> {
    // Get the configured manifest path from settings
    const config = vscode.workspace.getConfiguration('dbtDepthy');
    const relativePath = config.get<string>('manifestPath') || 'target/manifest.json';

    // Search for manifest.json files in the workspace
    const manifestFiles = await vscode.workspace.findFiles('**/manifest.json', '**/node_modules/**');
    
    // Try to find target/manifest.json first
    for (const file of manifestFiles) {
      if (file.fsPath.includes('/target/') || file.fsPath.includes('\\target\\')) {
        return file.fsPath;
      }
    }
    
    // If not found in target, use any manifest file
    if (manifestFiles.length > 0) {
      return manifestFiles[0].fsPath;
    }
    
    // Find all dbt_project.yml files in the workspace
    const projectFiles = await vscode.workspace.findFiles('**/dbt_project.yml', '**/node_modules/**');
    
    // For each dbt_project.yml, check if the manifest file exists
    for (const projectFile of projectFiles) {
      const projectDir = path.dirname(projectFile.fsPath);
      const manifestPath = path.join(projectDir, relativePath);
      
      if (fs.existsSync(manifestPath)) {
        return manifestPath;
      }
      
      // Also check for manifest.json directly in the project directory
      const directManifestPath = path.join(projectDir, 'manifest.json');
      if (fs.existsSync(directManifestPath)) {
        return directManifestPath;
      }
    }
    
    return undefined;
  }

  /**
   * Calculates the depth of each model in the dependency graph
   */
  private calculateModelDepths(): void {
    if (!this.manifest) {
      return;
    }

    // Clear the current depths
    this._modelDepths.clear();

    // Get all models from the manifest
    const models: { name: string, id: string }[] = [];
    
    for (const [id, node] of Object.entries(this.manifest.nodes)) {
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
      const parents = this.manifest.parent_map[model.id] || [];
      
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
      this._modelDepths.set(model.name, depth);
      this._modelDepths.set(model.id, depth);
    }

    console.log('Model depths calculated:', this._modelDepths);
  }
}