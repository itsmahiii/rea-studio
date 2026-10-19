import { describe, it, expect } from 'vitest';
import { classifyTarget, targetService } from '@/main/services/target';

describe('Target Classification & Validation', () => {
  it('correctly classifies URLs', () => {
    const res = classifyTarget('https://example.com/api');
    expect(res.targetType).toBe('url');
    expect(res.isDirectory).toBe(false);
    expect(res.exists).toBe(true);
  });

  it('classifies file extensions appropriately', () => {
    // When file does not exist, returns exists: false
    const nonExistent = classifyTarget('nonexistent.file');
    expect(nonExistent.exists).toBe(false);

    // Using targetService.validate on existing workspace folder
    const currentDir = targetService.validate(process.cwd());
    expect(currentDir.exists).toBe(true);
    expect(currentDir.isDirectory).toBe(true);
  });
});
