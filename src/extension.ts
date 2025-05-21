import * as vscode from 'vscode';
import { DbtManifestParser } from './manifestParser';
import { DbtDepthDecorationProvider } from './decorationProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('dbt Depthy is now active');

  // Create the manifest parser and decoration provider
  const manifestParser = new DbtManifestParser();
  const decorationProvider = new DbtDepthDecorationProvider(manifestParser);

  // Register commands
  const refreshCommand = vscode.commands.registerCommand(
    'dbtDepthy.refreshManifest',
    () => {
      vscode.window.showInformationMessage('Refreshing dbt model depth information...');
      manifestParser.refreshManifest();
    }
  );

  // Register the decoration provider
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        decorationProvider.updateDecorations(editor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
        decorationProvider.updateDecorations(vscode.window.activeTextEditor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('dbtDepthy')) {
        if (vscode.window.activeTextEditor) {
          decorationProvider.updateDecorations(vscode.window.activeTextEditor);
        }
      }
    }),
    refreshCommand,
    // Also register the hover provider
    decorationProvider.hoverProvider
  );

  // Update decorations for the active editor
  if (vscode.window.activeTextEditor) {
    decorationProvider.updateDecorations(vscode.window.activeTextEditor);
  }

  // Monitor for dbt_project.yml presence to auto-load manifest
  const watcher = vscode.workspace.createFileSystemWatcher('**/dbt_project.yml');
  context.subscriptions.push(
    watcher.onDidCreate(() => manifestParser.refreshManifest()),
    watcher.onDidChange(() => manifestParser.refreshManifest()),
    watcher
  );

  // Attempt to load the manifest initially
  manifestParser.refreshManifest();
}

export function deactivate() {}