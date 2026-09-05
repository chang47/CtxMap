import { describe, it, expect } from 'vitest';
import { extractJudgeInput, buildJudgePrompt, parseJudgeResponse } from '../../src/core/judge.js';
import type { JsonlEntry } from '../../src/core/types.js';

describe('extractJudgeInput', () => {
  it('takes the first real user prompt and the last assistant text', () => {
    const entries: JsonlEntry[] = [
      { type: 'user', timestamp: 't', sessionId: 's', message: { role: 'user', content: 'Fix the login bug' } },
      { type: 'assistant', timestamp: 't', sessionId: 's', message: { role: 'assistant', content: [{ type: 'text', text: 'Looking…' }] } },
      { type: 'assistant', timestamp: 't', sessionId: 's', message: { role: 'assistant', content: [{ type: 'text', text: 'Fixed and tests pass.' }] } },
    ];
    const { task, finalOutput } = extractJudgeInput(entries);
    expect(task).toBe('Fix the login bug');
    expect(finalOutput).toBe('Fixed and tests pass.');
  });

  it('skips sidechain + meta and tolerates no matches', () => {
    const entries: JsonlEntry[] = [
      { type: 'user', timestamp: 't', sessionId: 's', isSidechain: true, message: { role: 'user', content: 'sub' } },
      { type: 'user', timestamp: 't', sessionId: 's', message: { role: 'user', content: '<command-name>foo</command-name>' } },
    ];
    const { task, finalOutput } = extractJudgeInput(entries);
    expect(task).toBe('');
    expect(finalOutput).toBe('');
  });
});

describe('buildJudgePrompt', () => {
  it('embeds task + output and asks for JSON only', () => {
    const { system, user } = buildJudgePrompt({ task: 'T', finalOutput: 'O' });
    expect(system).toMatch(/JSON/);
    expect(user).toContain('T');
    expect(user).toContain('O');
  });
});

describe('parseJudgeResponse', () => {
  it('parses a clean JSON verdict', () => {
    expect(parseJudgeResponse('{"rating":"good","rationale":"did it"}')).toEqual({ rating: 'good', rationale: 'did it' });
  });
  it('extracts JSON embedded in prose', () => {
    expect(parseJudgeResponse('Here is my verdict: {"rating":"ok","rationale":"partial"} done')?.rating).toBe('ok');
  });
  it('rejects an invalid or missing rating', () => {
    expect(parseJudgeResponse('{"rating":"great"}')).toBeNull();
    expect(parseJudgeResponse('no json here')).toBeNull();
  });
});
