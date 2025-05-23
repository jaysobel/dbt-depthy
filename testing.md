# Testing Plan for dbt-depthy Extension

## Overview
This document outlines a comprehensive testing strategy for the dbt-depthy VSCode extension, focusing on basic coverage of crucial functionality while maintaining simplicity and maintainability.

## Testing Structure

### 1. Unit Tests (Isolated Logic Testing)
**Location**: `src/test/unit/`

#### 1.1 Depth Calculation Logic (`depthCalculation.test.ts`) ✅ 
- **Status**: Already implemented
- **Coverage**: Core DAG depth calculation algorithm
- **Test Cases**:
  - Maximum depth calculation with multiple paths
  - Diamond dependency patterns
  - Models with no dependencies
  - Complex multi-path scenarios
  - Edge cases (circular dependencies, empty manifests)

#### 1.2 Manifest Parser (`manifestParser.test.ts`)
- **Purpose**: Test manifest parsing and data extraction
- **Test Cases**:
  - Valid manifest.json parsing
  - Invalid/malformed manifest handling
  - Model filtering (only models, not sources/tests)
  - Dependency graph construction
  - Model name resolution (full vs. short names)
  - Error handling for missing files

#### 1.3 Decoration Provider (`decorationProvider.test.ts`)
- **Purpose**: Test decoration logic without VSCode APIs
- **Test Cases**:
  - Regex pattern matching for `{{ ref('model') }}`
  - Depth-to-color mapping
  - Configuration threshold handling
  - File type detection (SQL files in models/ directory)
  - Hover text generation

### 2. Integration Tests (Component Interaction)
**Location**: `src/test/integration/`

#### 2.1 End-to-End Workflow (`e2e.test.ts`)
- **Purpose**: Test complete workflow from manifest to decorations
- **Test Cases**:
  - Load manifest → calculate depths → apply decorations
  - Manifest refresh functionality
  - Configuration changes affecting decorations
  - Multiple workspace folders

#### 2.2 File System Integration (`filesystem.test.ts`)
- **Purpose**: Test file discovery and watching
- **Test Cases**:
  - Manifest file discovery in different locations
  - dbt_project.yml detection
  - File watching for manifest changes
  - Workspace configuration integration

### 3. VSCode Extension Tests (Real Environment)
**Location**: `src/test/extension/`

#### 3.1 Extension Activation (`activation.test.ts`)
- **Purpose**: Test extension lifecycle within VSCode
- **Test Cases**:
  - Extension activates on dbt_project.yml presence
  - Commands register correctly
  - Event listeners attach properly
  - Extension deactivation cleanup

#### 3.2 Editor Integration (`editor.test.ts`)
- **Purpose**: Test decoration application in real editors
- **Test Cases**:
  - Decorations appear in SQL files
  - Decorations update on text changes
  - Hover provider works correctly
  - Performance with large files

### 4. Test Data and Fixtures
**Location**: `src/test/fixtures/`

#### 4.1 Sample Manifests (`manifests/`)
- `simple-manifest.json` - Basic linear dependencies
- `complex-manifest.json` - Multi-path, diamond patterns
- `large-manifest.json` - Performance testing
- `invalid-manifest.json` - Error case testing

#### 4.2 Sample SQL Files (`sql/`)
- `models/staging/` - Files with ref() calls
- `models/marts/` - Complex dependency chains
- `analysis/` - Non-model SQL (should not be decorated)

#### 4.3 Sample Projects (`projects/`)
- `minimal-dbt/` - Basic dbt project structure
- `multi-package/` - Multiple dbt packages
- `no-manifest/` - Project without compiled manifest

## Testing Implementation Priority

### Phase 1: Core Logic (High Priority)
1. ✅ Depth calculation unit tests (completed)
2. Manifest parser unit tests
3. Basic decoration logic tests

### Phase 2: Integration (Medium Priority)
1. End-to-end workflow tests
2. File system integration tests
3. Configuration handling tests

### Phase 3: VSCode Integration (Lower Priority)
1. Extension activation tests
2. Editor integration tests
3. Performance tests with large projects

## Test Infrastructure

### Testing Framework
- **Unit/Integration**: Mocha + Assert (already configured)
- **VSCode Tests**: @vscode/test-electron (already available)
- **Mocking**: Sinon.js for external dependencies

### Test Scripts (package.json)
```json
{
  "scripts": {
    "test": "npm run test-unit && npm run test-integration",
    "test-unit": "mocha out/test/unit/**/*.test.js",
    "test-integration": "mocha out/test/integration/**/*.test.js", 
    "test-vscode": "node ./out/test/runTest.js",
    "test-watch": "npm run test-compile && npm run test-unit -- --watch",
    "test-coverage": "nyc npm run test-unit"
  }
}
```

### Mock Strategy
- **VSCode APIs**: Mock vscode module for unit tests
- **File System**: Mock fs operations for predictable testing
- **Configuration**: Mock workspace configuration
- **Events**: Mock event emitters and listeners

## Continuous Integration Considerations

### GitHub Actions Workflow
- Run unit tests on every PR
- Run integration tests on main branch
- VSCode extension tests on release candidates
- Test against multiple VSCode versions

### Test Data Management
- Keep test manifests small but representative
- Use realistic dbt model names and structures
- Include both valid and invalid scenarios
- Test with different dbt project configurations

## Performance Testing

### Benchmarks
- Manifest parsing time for various sizes
- Decoration update latency
- Memory usage with large projects
- File watching performance

### Load Testing Scenarios
- 1000+ models in manifest
- Complex dependency graphs (10+ levels deep)
- Multiple workspace folders
- Frequent manifest updates

## Error Case Coverage

### Input Validation
- Malformed manifest.json files
- Missing or inaccessible manifest files
- Invalid dbt project structures
- Unsupported dbt versions

### Runtime Errors
- File system permission issues
- Network-related manifest access
- Memory constraints with large projects
- Extension conflicts

## Maintenance Strategy

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names explaining the scenario
- Include both positive and negative test cases
- Document complex test scenarios

### Test Data Updates
- Update test manifests when dbt schema changes
- Maintain compatibility with multiple dbt versions
- Regular review of test coverage gaps
- Remove obsolete test cases

## Success Metrics

### Coverage Goals
- **Unit Tests**: 80%+ code coverage for core logic
- **Integration Tests**: All major workflows covered
- **Error Handling**: All error paths tested
- **Configuration**: All settings combinations tested

### Quality Gates
- All tests pass before merging
- No decrease in test coverage
- Performance benchmarks maintained
- No new eslint violations in test code

## Future Enhancements

### Advanced Testing
- Property-based testing for depth calculations
- Fuzz testing with generated manifests
- Visual regression testing for decorations
- Multi-language support testing

### Tooling Improvements
- Test report generation
- Coverage reporting integration
- Automated test data generation
- Performance regression detection