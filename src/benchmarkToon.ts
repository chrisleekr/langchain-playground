/**
 * TOON Token Efficiency Benchmark Script
 *
 * Compares token usage between JSON and TOON encoding for different data structures.
 * Uses the GPT tokenizer for accurate token counting.
 *
 * Run: npx ts-node src/benchmarkToon.ts
 */
import { encode as toonEncode } from '@toon-format/toon';
import { encode as gptEncode } from 'gpt-tokenizer';

interface BenchmarkResult {
  dataType: string;
  rowCount: number;
  jsonPrettyTokens: number;
  jsonCompactTokens: number;
  toonTokens: number;
  savingsVsPretty: string;
  savingsVsCompact: string;
}

/**
 * Count tokens using GPT tokenizer (o200k_base encoding)
 */
const countTokens = (text: string): number => {
  return gptEncode(text).length;
};

/**
 * Generate sample RDS instance data (uniform array)
 */
const generateRdsInstances = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    instanceIdentifier: `db-instance-${i + 1}`,
    clusterIdentifier: `aurora-cluster-prod`,
    instanceClass: 'db.r6g.2xlarge',
    engine: 'aurora-postgresql 15.4',
    status: 'available',
    isClusterWriter: i === 0,
    metrics: {
      cpuUtilization: `${(Math.random() * 100).toFixed(2)}% avg / ${(Math.random() * 100).toFixed(2)}% max`,
      freeableMemory: `${(Math.random() * 64).toFixed(2)} GB avg / ${(Math.random() * 64).toFixed(2)} GB min`,
      databaseConnections: `${Math.floor(Math.random() * 500)} avg / ${Math.floor(Math.random() * 800)} max`,
      readIOPS: `${Math.floor(Math.random() * 10000)} avg / ${Math.floor(Math.random() * 20000)} max`,
      writeIOPS: `${Math.floor(Math.random() * 5000)} avg / ${Math.floor(Math.random() * 10000)} max`
    }
  }));
};

/**
 * Generate sample ECS task data (uniform array)
 */
const generateEcsTasks = (count: number) => {
  const statuses = ['RUNNING', 'STOPPED', 'PENDING'];
  return Array.from({ length: count }, (_, i) => ({
    taskId: `task-${i + 1}-${Math.random().toString(36).substring(7)}`,
    taskArn: `arn:aws:ecs:us-east-1:123456789:task/cluster-prod/task-${i + 1}`,
    clusterName: 'cluster-prod',
    serviceName: 'api-service',
    lastStatus: statuses[i % statuses.length],
    desiredStatus: 'RUNNING',
    cpu: '1024',
    memory: '2048',
    launchType: 'FARGATE',
    createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    metrics: {
      avgCpuUtilizationPercent: (Math.random() * 100).toFixed(2),
      maxCpuUtilizationPercent: (Math.random() * 100).toFixed(2),
      avgMemoryUtilizationPercent: (Math.random() * 100).toFixed(2),
      maxMemoryUtilizationPercent: (Math.random() * 100).toFixed(2)
    }
  }));
};

/**
 * Generate sample Top SQL queries data (uniform array)
 */
const generateTopSqlQueries = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    sqlId: Math.random().toString(36).substring(2, 18).toUpperCase(),
    avgDbLoad: (Math.random() * 10).toFixed(4),
    loadPercentage: (Math.random() * 50).toFixed(2),
    sqlText: `SELECT u.id, u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE o.status = 'pending' AND u.created_at > '2024-01-01' ORDER BY o.total DESC LIMIT ${100 + i}`
  }));
};

/**
 * Run benchmark for a specific data type
 */
const benchmark = (dataType: string, data: unknown[], rowCount: number): BenchmarkResult => {
  const jsonPretty = JSON.stringify(data, null, 2);
  const jsonCompact = JSON.stringify(data);
  const toon = toonEncode(data);

  const jsonPrettyTokens = countTokens(jsonPretty);
  const jsonCompactTokens = countTokens(jsonCompact);
  const toonTokens = countTokens(toon);

  const savingsVsPretty = (((jsonPrettyTokens - toonTokens) / jsonPrettyTokens) * 100).toFixed(1);
  const savingsVsCompact = (((jsonCompactTokens - toonTokens) / jsonCompactTokens) * 100).toFixed(1);

  return {
    dataType,
    rowCount,
    jsonPrettyTokens,
    jsonCompactTokens,
    toonTokens,
    savingsVsPretty: `${savingsVsPretty}%`,
    savingsVsCompact: `${savingsVsCompact}%`
  };
};

/**
 * Main benchmark runner
 */
const runBenchmarks = () => {
  console.log('\n=== TOON Token Efficiency Benchmark ===\n');
  console.log('Comparing JSON (pretty & compact) vs TOON encoding\n');

  const results: BenchmarkResult[] = [];

  // Benchmark different data sizes
  const sizes = [5, 10, 20, 50];

  for (const size of sizes) {
    results.push(benchmark('RDS Instances', generateRdsInstances(size), size));
    results.push(benchmark('ECS Tasks', generateEcsTasks(size), size));
    results.push(benchmark('Top SQL Queries', generateTopSqlQueries(size), size));
  }

  // Print results as table
  console.log('Data Type           | Rows | JSON Pretty | JSON Compact | TOON  | vs Pretty | vs Compact');
  console.log('-'.repeat(100));

  for (const r of results) {
    console.log(
      `${r.dataType.padEnd(19)} | ${String(r.rowCount).padStart(4)} | ${String(r.jsonPrettyTokens).padStart(11)} | ${String(r.jsonCompactTokens).padStart(12)} | ${String(r.toonTokens).padStart(5)} | ${r.savingsVsPretty.padStart(9)} | ${r.savingsVsCompact.padStart(10)}`
    );
  }

  console.log('\n=== Summary ===\n');

  // Calculate averages
  const avgSavingsVsPretty =
    results.reduce((sum, r) => sum + parseFloat(r.savingsVsPretty), 0) / results.length;
  const avgSavingsVsCompact =
    results.reduce((sum, r) => sum + parseFloat(r.savingsVsCompact), 0) / results.length;

  console.log(`Average savings vs JSON (pretty): ${avgSavingsVsPretty.toFixed(1)}%`);
  console.log(`Average savings vs JSON (compact): ${avgSavingsVsCompact.toFixed(1)}%`);

  console.log('\nNote: Token counts use GPT tokenizer (o200k_base encoding)');
  console.log('Actual savings will vary based on data structure and LLM tokenizer.\n');
};

// Run benchmarks
runBenchmarks();
