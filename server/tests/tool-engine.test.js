/**
 * Tool Engine Tests
 * Run with: node server/tests/tool-engine.test.js
 */

const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

function test(name, fn) {
  try {
    fn();
    testResults.passed++;
    testResults.tests.push({ name, status: 'PASS' });
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    testResults.failed++;
    testResults.tests.push({ name, status: 'FAIL', error: error.message });
    console.error(`❌ FAIL: ${name} - ${error.message}`);
  }
}

async function runToolEngineTests() {
  console.log('\n🧪 Running Tool Engine Tests...\n');

  const { detectIntent, STATIC_FAILURE_MESSAGE } = await import('../services/ai/tool-engine.js');

  test('STATIC_FAILURE_MESSAGE is defined', () => {
    if (typeof STATIC_FAILURE_MESSAGE !== 'string' || !STATIC_FAILURE_MESSAGE.length) {
      throw new Error('STATIC_FAILURE_MESSAGE missing or empty');
    }
  });

  const intentCases = [
    { query: 'Who are on leave today?', expected: 'LeaveTool.getLeavesByDate' },
    { query: 'Show pending leave approvals', expected: 'LeaveTool.getPendingLeaveApprovals' },
    { query: 'How many people joined this week', expected: 'OnboardingTool.getNewJoineesByDate' },
    { query: 'Total headcount', expected: 'AnalyticsTool.getHeadcount' },
    { query: 'Show department metrics', expected: 'AnalyticsTool.getDepartmentMetrics' },
    { query: 'employee information for john', expected: 'EmployeeDirectoryTool.getEmployeeDetails' },
  ];

  for (const { query, expected } of intentCases) {
    test(`detectIntent maps "${query}" to ${expected}`, () => {
      const intent = detectIntent(query);
      if (!intent || intent.toolAction !== expected) {
        throw new Error(`Expected ${expected} but got ${JSON.stringify(intent)}`);
      }
    });
  }

  test('detectIntent returns null for unsupported queries', () => {
    const intent = detectIntent('tell me a joke');
    if (intent !== null) {
      throw new Error('Expected null for unsupported query');
    }
  });

  console.log(`\n📊 Tool Engine Test Results: ${testResults.passed} passed, ${testResults.failed} failed\n`);
}

// Main runner
async function runTests() {
  console.log('🚀 Starting Tool Engine Tests...\n');
  await runToolEngineTests();

  console.log('\n📋 Final Test Summary:');
  console.log(`   ✅ Passed: ${testResults.passed}`);
  console.log(`   ❌ Failed: ${testResults.failed}`);
  console.log(`   📊 Total: ${testResults.passed + testResults.failed}\n`);

  if (testResults.failed > 0) {
    process.exitCode = 1;
  }
}

runTests();










