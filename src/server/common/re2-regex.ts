import RE2 from 're2';
import { setRegexFactory } from '../../shared/engine/regex.js';

/**
 * Run all engine regexes on RE2. Form patterns are attacker-controlled on public
 * submits, and RE2 matches in linear time, so they cannot be used for ReDoS.
 */
export function useRe2Regex(): void {
  setRegexFactory((pattern, flags) => new RE2(pattern, flags));
}
