import * as vscode from 'vscode';
import { DbtManifestParser } from './manifestParser';

export class DbtDepthDecorationProvider {
  private readonly REF_PATTERN = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g;
  private readonly decorationType: vscode.TextEditorDecorationType;
  public readonly hoverProvider: vscode.Disposable;
  
  constructor(private manifestParser: DbtManifestParser) {
    // Create the decoration type for the depth indicator
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 5px',
        textDecoration: 'none'
      }
    });
    
    // Register a hover provider for our depth indicators
    this.hoverProvider = vscode.languages.registerHoverProvider(['sql', 'jinja-sql'], {
      provideHover: (document, position, token) => {
        return this.provideHoverForDepthIndicator(document, position, token);
      }
    });

    // Listen for manifest updates
    this.manifestParser.onManifestUpdated(() => {
      // Update all visible editors
      vscode.window.visibleTextEditors.forEach(editor => {
        this.updateDecorations(editor);
      });
    });
  }

  /**
   * Updates the decorations in the given text editor
   */
  public updateDecorations(editor: vscode.TextEditor): void {
    // Only decorate DBT SQL files
    if (!this.isDbtFile(editor.document)) {
      return;
    }

    const text = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];
    let match;

    // Find all ref() calls in the document
    while ((match = this.REF_PATTERN.exec(text)) !== null) {
      const startPos = editor.document.positionAt(match.index);
      const endPos = editor.document.positionAt(match.index + match[0].length);
      const refRange = new vscode.Range(startPos, endPos);
      
      const modelName = match[1];
      const depth = this.manifestParser.getModelDepth(modelName);
      
      if (depth !== undefined) {
        // Create a decoration with the depth indicator
        decorations.push(this.createDepthDecoration(refRange, depth));
      }
    }

    // Apply the decorations to the editor
    editor.setDecorations(this.decorationType, decorations);
  }

  /**
   * Creates a decoration for the given range with the depth indicator
   */
  private createDepthDecoration(refRange: vscode.Range, depth: number): vscode.DecorationOptions {
    const config = vscode.workspace.getConfiguration('dbtDepthy');
    const mediumThreshold = config.get<number>('mediumDepthThreshold') || 3;
    const highThreshold = config.get<number>('highDepthThreshold') || 6;
    
    const lowColor = config.get<string>('colorLowDepth') || 'rgba(0, 200, 0, 0.7)';
    const mediumColor = config.get<string>('colorMediumDepth') || 'rgba(200, 200, 0, 0.7)';
    const highColor = config.get<string>('colorHighDepth') || 'rgba(200, 0, 0, 0.7)';
    
    // Increment depth by 1 so staging models (depth 0) show as 1
    const adjustedDepth = depth + 1;
    
    // Determine the color based on adjusted depth
    let color = lowColor;
    if (adjustedDepth >= highThreshold) {
      color = highColor;
    } else if (adjustedDepth >= mediumThreshold) {
      color = mediumColor;
    }
    
    const displayDepth = adjustedDepth;
    
    // Always use parentheses style for the depth indicator
    const depthText = `(${displayDepth})`;

    return {
      range: refRange,
      renderOptions: {
        after: {
          contentText: `${depthText}`,
          backgroundColor: color,
          color: 'white',
          fontWeight: 'bold',
          margin: '0 0 0 3px'
        }
      }
    };
  }

  /**
   * Provides hover information for depth indicators
   */
  private provideHoverForDepthIndicator(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.Hover | undefined {
    if (!this.isDbtFile(document)) {
      return undefined;
    }

    const text = document.getText();
    let match;
    this.REF_PATTERN.lastIndex = 0; // Reset regex index

    // Look for each ref in the document and check if the hover is over its decoration
    while ((match = this.REF_PATTERN.exec(text)) !== null) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);
      
      // The decoration appears after the ref pattern
      // Check if the hover is at the end of the ref or just after it (where our decoration is)
      const isHoverNearReference = endPos.line === position.line && 
                                  position.character >= endPos.character && 
                                  position.character <= endPos.character + 6; // Approximate width of decoration

      if (isHoverNearReference) {
        const modelName = match[1];
        const depth = this.manifestParser.getModelDepth(modelName);
        
        if (depth !== undefined) {
          // Increment depth by 1 as we do in the decoration
          const adjustedDepth = depth + 1;
          
          // Create hover content
          const hoverContent = new vscode.MarkdownString();
          hoverContent.appendMarkdown(`The referenced model \`${modelName}\` has a DAG depth of ${adjustedDepth}.\n\n`);
          hoverContent.appendMarkdown(`The longest path of models between a source and \`${modelName}\` is ${adjustedDepth} nodes long.\n\n`);
          hoverContent.appendMarkdown(`Annotation created by extension: dbt Depthy`);
          hoverContent.isTrusted = true;
          
          return new vscode.Hover(hoverContent, range);
        }
      }
    }
    
    return undefined;
  }

  /**
   * Determines if the document is a dbt file
   */
  private isDbtFile(document: vscode.TextDocument): boolean {
    // Check if it's a SQL file
    const isSqlFile = document.languageId === 'sql' || 
                     document.languageId === 'jinja-sql' ||
                     document.fileName.endsWith('.sql');
    
    // If not a SQL file, it's not a dbt file
    if (!isSqlFile) {
      return false;
    }
    
    // Additional check: either it contains a ref() call, or it's in a models directory
    return document.getText().includes('ref(') || 
           document.fileName.includes('/models/') ||
           document.fileName.includes('\\models\\');
  }
}