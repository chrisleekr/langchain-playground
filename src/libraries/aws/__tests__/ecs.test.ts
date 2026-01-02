import { parseTaskArn, extractTaskArnsFromText, extractTaskArnsFromLogs } from '../ecs';

describe('parseTaskArn', () => {
  it('parses a valid ECS task ARN correctly', () => {
    const arn = 'arn:aws:ecs:ap-southeast-2:922237793329:task/ecs-cluster-72168a8/4c47ef4ef2b44ade84eb7131916c4fd0';
    const result = parseTaskArn(arn);

    expect(result).toEqual({
      region: 'ap-southeast-2',
      accountId: '922237793329',
      clusterName: 'ecs-cluster-72168a8',
      taskId: '4c47ef4ef2b44ade84eb7131916c4fd0',
      fullArn: arn
    });
  });

  it('parses a task ARN with dashes in task ID', () => {
    const arn = 'arn:aws:ecs:us-east-1:123456789012:task/my-cluster/a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = parseTaskArn(arn);

    expect(result).toEqual({
      region: 'us-east-1',
      accountId: '123456789012',
      clusterName: 'my-cluster',
      taskId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      fullArn: arn
    });
  });

  it('returns null for invalid ARN format', () => {
    expect(parseTaskArn('invalid-arn')).toBeNull();
    expect(parseTaskArn('')).toBeNull();
    expect(parseTaskArn('arn:aws:ecs:us-east-1:123456789012:service/my-service')).toBeNull();
    expect(parseTaskArn('arn:aws:ecs:us-east-1:123456789012:task/cluster')).toBeNull();
  });

  it('returns null for ARN with missing components', () => {
    expect(parseTaskArn('arn:aws:ecs:::task/cluster/task')).toBeNull();
    expect(parseTaskArn('arn:aws:ecs:us-east-1::task/cluster/task')).toBeNull();
  });
});

describe('extractTaskArnsFromText', () => {
  it('extracts a single task ARN from text', () => {
    const text = 'Investigate task arn:aws:ecs:ap-southeast-2:922237793329:task/my-cluster/abc123def456';
    const result = extractTaskArnsFromText(text);

    expect(result).toHaveLength(1);
    expect(result[0]?.region).toBe('ap-southeast-2');
    expect(result[0]?.clusterName).toBe('my-cluster');
    expect(result[0]?.taskId).toBe('abc123def456');
  });

  it('extracts multiple task ARNs from text', () => {
    const text = `
      Task 1: arn:aws:ecs:us-east-1:111111111111:task/cluster-a/task-1
      Task 2: arn:aws:ecs:eu-west-1:222222222222:task/cluster-b/task-2
    `;
    const result = extractTaskArnsFromText(text);

    expect(result).toHaveLength(2);
    expect(result[0]?.region).toBe('us-east-1');
    expect(result[1]?.region).toBe('eu-west-1');
  });

  it('deduplicates repeated task ARNs', () => {
    const arn = 'arn:aws:ecs:us-east-1:123456789012:task/cluster/abc123';
    const text = `Task: ${arn} and again: ${arn}`;
    const result = extractTaskArnsFromText(text);

    expect(result).toHaveLength(1);
  });

  it('returns empty array for text without ARNs', () => {
    expect(extractTaskArnsFromText('No ARNs here')).toEqual([]);
    expect(extractTaskArnsFromText('')).toEqual([]);
  });

  it('handles ARNs embedded in JSON', () => {
    const json = '{"ecs_task_arn": "arn:aws:ecs:us-east-1:123456789012:task/cluster/abc123"}';
    const result = extractTaskArnsFromText(json);

    expect(result).toHaveLength(1);
    expect(result[0]?.taskId).toBe('abc123');
  });
});

describe('extractTaskArnsFromLogs', () => {
  it('extracts task ARNs from log entries with ecs_task_arn field', () => {
    const logs = [
      { ecs_task_arn: 'arn:aws:ecs:us-east-1:123456789012:task/cluster/task-1', message: 'Error' },
      { ecs_task_arn: 'arn:aws:ecs:us-east-1:123456789012:task/cluster/task-2', message: 'Warning' }
    ];
    const result = extractTaskArnsFromLogs(logs);

    expect(result).toHaveLength(2);
    expect(result[0]?.taskId).toBe('task-1');
    expect(result[1]?.taskId).toBe('task-2');
  });

  it('ignores log entries without ecs_task_arn field', () => {
    const logs = [{ ecs_task_arn: 'arn:aws:ecs:us-east-1:123456789012:task/cluster/task-1' }, { message: 'No ARN here' }, { other_field: 'value' }];
    const result = extractTaskArnsFromLogs(logs);

    expect(result).toHaveLength(1);
  });

  it('deduplicates repeated task ARNs across logs', () => {
    const arn = 'arn:aws:ecs:us-east-1:123456789012:task/cluster/task-1';
    const logs = [{ ecs_task_arn: arn }, { ecs_task_arn: arn }, { ecs_task_arn: arn }];
    const result = extractTaskArnsFromLogs(logs);

    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty log array', () => {
    expect(extractTaskArnsFromLogs([])).toEqual([]);
  });

  it('handles non-string ecs_task_arn values', () => {
    const logs = [
      { ecs_task_arn: null },
      { ecs_task_arn: undefined },
      { ecs_task_arn: 123 },
      { ecs_task_arn: { nested: 'object' } },
      { ecs_task_arn: '' }
    ];
    const result = extractTaskArnsFromLogs(logs);

    expect(result).toEqual([]);
  });

  it('extracts ARNs from multiple regions', () => {
    const logs = [
      { ecs_task_arn: 'arn:aws:ecs:us-east-1:123456789012:task/cluster-us/task-1' },
      { ecs_task_arn: 'arn:aws:ecs:ap-southeast-2:123456789012:task/cluster-ap/task-2' },
      { ecs_task_arn: 'arn:aws:ecs:eu-west-1:123456789012:task/cluster-eu/task-3' }
    ];
    const result = extractTaskArnsFromLogs(logs);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.region)).toEqual(['us-east-1', 'ap-southeast-2', 'eu-west-1']);
  });
});
