import * as assert from 'assert';

describe('DecorationProvider Core Logic', () => {
  describe('REF Pattern Matching', () => {
    const REF_PATTERN = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g;

    it('should match basic ref patterns', () => {
      const sqlContent = "select * from {{ ref('staging_users') }}";
      const matches: string[] = [];
      let match;

      REF_PATTERN.lastIndex = 0;
      while ((match = REF_PATTERN.exec(sqlContent)) !== null) {
        matches.push(match[1]);
      }

      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0], 'staging_users');
    });

    it('should match ref patterns with double quotes', () => {
      const sqlContent = 'select * from {{ ref("staging_orders") }}';
      const matches: string[] = [];
      let match;

      REF_PATTERN.lastIndex = 0;
      while ((match = REF_PATTERN.exec(sqlContent)) !== null) {
        matches.push(match[1]);
      }

      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0], 'staging_orders');
    });

    it('should match multiple ref patterns', () => {
      const sqlContent = `
        select u.*, o.order_count
        from {{ ref('dim_users') }} u
        join {{ ref("fct_orders") }} o on u.user_id = o.user_id
      `;
      const matches: string[] = [];
      let match;

      REF_PATTERN.lastIndex = 0;
      while ((match = REF_PATTERN.exec(sqlContent)) !== null) {
        matches.push(match[1]);
      }

      assert.strictEqual(matches.length, 2);
      assert.strictEqual(matches[0], 'dim_users');
      assert.strictEqual(matches[1], 'fct_orders');
    });

    it('should handle refs with spaces', () => {
      const sqlContent = "select * from {{  ref(  'staging_users'  )  }}";
      const matches: string[] = [];
      let match;

      REF_PATTERN.lastIndex = 0;
      while ((match = REF_PATTERN.exec(sqlContent)) !== null) {
        matches.push(match[1]);
      }

      assert.strictEqual(matches.length, 1);
      assert.strictEqual(matches[0], 'staging_users');
    });

    it('should not match invalid patterns', () => {
      const sqlContent = `
        select * from ref('invalid_syntax
        select * from {{ not_ref('model') }}
        select * from ref without parentheses
      `;
      const matches: string[] = [];
      let match;

      REF_PATTERN.lastIndex = 0;
      while ((match = REF_PATTERN.exec(sqlContent)) !== null) {
        matches.push(match[1]);
      }

      assert.strictEqual(matches.length, 0);
    });
  });

  describe('Depth to Color Mapping Logic', () => {
    function getColorForDepth(depth: number, mediumThreshold: number = 3, highThreshold: number = 6): string {
      const adjustedDepth = depth + 1; // Same logic as in decorationProvider
      
      if (adjustedDepth >= highThreshold) {
        return 'rgba(200, 0, 0, 0.7)'; // high color
      } else if (adjustedDepth >= mediumThreshold) {
        return 'rgba(200, 200, 0, 0.7)'; // medium color
      } else {
        return 'rgba(0, 200, 0, 0.7)'; // low color
      }
    }

    it('should return low color for depths below medium threshold', () => {
      assert.strictEqual(getColorForDepth(0), 'rgba(0, 200, 0, 0.7)'); // depth 0 + 1 = 1 < 3
      assert.strictEqual(getColorForDepth(1), 'rgba(0, 200, 0, 0.7)'); // depth 1 + 1 = 2 < 3
    });

    it('should return medium color for depths at medium threshold', () => {
      assert.strictEqual(getColorForDepth(2), 'rgba(200, 200, 0, 0.7)'); // depth 2 + 1 = 3 >= 3
      assert.strictEqual(getColorForDepth(3), 'rgba(200, 200, 0, 0.7)'); // depth 3 + 1 = 4 >= 3
    });

    it('should return high color for depths at high threshold', () => {
      assert.strictEqual(getColorForDepth(5), 'rgba(200, 0, 0, 0.7)'); // depth 5 + 1 = 6 >= 6
      assert.strictEqual(getColorForDepth(8), 'rgba(200, 0, 0, 0.7)'); // depth 8 + 1 = 9 >= 6
    });

    it('should respect custom thresholds', () => {
      assert.strictEqual(getColorForDepth(3, 5, 10), 'rgba(0, 200, 0, 0.7)'); // 3+1=4 < 5
      assert.strictEqual(getColorForDepth(4, 5, 10), 'rgba(200, 200, 0, 0.7)'); // 4+1=5 >= 5, < 10
      assert.strictEqual(getColorForDepth(9, 5, 10), 'rgba(200, 0, 0, 0.7)'); // 9+1=10 >= 10
    });
  });

  describe('Depth Display Logic', () => {
    function getDisplayDepth(depth: number): string {
      const adjustedDepth = depth + 1;
      return `(${adjustedDepth})`;
    }

    it('should format depth display correctly', () => {
      assert.strictEqual(getDisplayDepth(0), '(1)');
      assert.strictEqual(getDisplayDepth(1), '(2)');
      assert.strictEqual(getDisplayDepth(5), '(6)');
      assert.strictEqual(getDisplayDepth(10), '(11)');
    });
  });

  describe('File Type Detection Logic', () => {
    function isDbtFile(fileName: string, languageId: string, content: string): boolean {
      // Check if it's a SQL file
      const isSqlFile = languageId === 'sql' || 
                       languageId === 'jinja-sql' ||
                       fileName.endsWith('.sql');
      
      // If not a SQL file, it's not a dbt file
      if (!isSqlFile) {
        return false;
      }
      
      // Additional check: either it contains a ref() call, or it's in a models directory
      return content.includes('ref(') || 
             fileName.includes('/models/') ||
             fileName.includes('\\models\\');
    }

    it('should detect SQL files in models directory', () => {
      assert.strictEqual(
        isDbtFile('/project/models/staging/users.sql', 'sql', 'select * from raw_users'),
        true
      );
    });

    it('should detect SQL files with ref() calls', () => {
      assert.strictEqual(
        isDbtFile('/project/analysis/report.sql', 'sql', 'select * from {{ ref("staging_users") }}'),
        true
      );
    });

    it('should not detect non-SQL files', () => {
      assert.strictEqual(
        isDbtFile('/project/test.py', 'python', 'print("hello")'),
        false
      );
    });

    it('should not detect SQL files outside models without ref()', () => {
      assert.strictEqual(
        isDbtFile('/project/analysis/report.sql', 'sql', 'select * from raw_users'),
        false
      );
    });

    it('should detect jinja-sql files', () => {
      assert.strictEqual(
        isDbtFile('/project/models/test.sql', 'jinja-sql', 'select * from raw_users'),
        true
      );
    });
  });

  describe('Hover Text Generation Logic', () => {
    function generateHoverText(modelName: string, depth: number): string {
      const adjustedDepth = depth + 1;
      return `The referenced model \`${modelName}\` has a DAG depth of ${adjustedDepth}.\n\n` +
             `The longest path of models between a source and \`${modelName}\` is ${adjustedDepth} nodes long.\n\n` +
             `Annotation created by extension: dbt Depthy`;
    }

    it('should generate correct hover text', () => {
      const hoverText = generateHoverText('staging_users', 1);
      
      assert.ok(hoverText.includes('staging_users'));
      assert.ok(hoverText.includes('depth of 2'));
      assert.ok(hoverText.includes('dbt Depthy'));
    });

    it('should handle different depths', () => {
      const hoverText1 = generateHoverText('dim_users', 2);
      const hoverText2 = generateHoverText('fct_orders', 5);
      
      assert.ok(hoverText1.includes('depth of 3'));
      assert.ok(hoverText2.includes('depth of 6'));
    });
  });
});