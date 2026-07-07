import { describe, expect, it } from 'vitest';
import type { HistoryItem } from '@my-app/shared';
import { formatHistoryDate, matchesHistorySearch } from '../src/lib/historySearch';

// created_at uses the D1/SQLite CURRENT_TIMESTAMP shape ('YYYY-MM-DD HH:MM:SS'),
// which JS Date parses as local time — same as the Archive screen receives.
const okItem: HistoryItem = {
  id: 1,
  status: 'success',
  error_msg: null,
  created_at: '2026-03-05 09:15:00',
};

const errItem: HistoryItem = {
  id: 777,
  status: 'error',
  error_msg: 'Quota exceeded for this month',
  created_at: '2026-04-18 22:40:10',
};

const history = [okItem, errItem];
const search = (query: string) => history.filter((item) => matchesHistorySearch(item, query));

describe('matchesHistorySearch', () => {
  it('matches by error message substring, case-insensitively', () => {
    expect(search('quota exceeded')).toEqual([errItem]);
    expect(search('THIS MONTH')).toEqual([errItem]);
  });

  it('matches by a fragment of the date exactly as displayed in the history row', () => {
    const displayed = formatHistoryDate(okItem.created_at);
    // The Archive screen renders dates via toLocaleString('ja-JP'), e.g. '2026/3/5 9:15:00'.
    expect(displayed).toContain('/');

    const dateFragment = displayed.split(' ')[0]; // e.g. '2026/3/5'
    expect(search(dateFragment)).toEqual([okItem]);

    // Time portion is searchable too.
    expect(search('9:15')).toEqual([okItem]);
  });

  it('matches by the displayed status label (OK / ERR), case-insensitively', () => {
    expect(search('OK')).toEqual([okItem]);
    expect(search('ok')).toEqual([okItem]);
    expect(search('ERR')).toEqual([errItem]);
    expect(search('err')).toEqual([errItem]);
  });

  it('matches by the raw status value', () => {
    expect(search('success')).toEqual([okItem]);
    expect(search('error')).toEqual([errItem]);
  });

  it('returns all items for an empty or whitespace-only query', () => {
    expect(search('')).toEqual(history);
    expect(search('   ')).toEqual(history);
  });

  it('returns no items when nothing matches', () => {
    expect(search('zzz-definitely-not-there')).toEqual([]);
  });

  it('does not match on values the user never sees', () => {
    // The numeric id is not displayed anywhere in the history row.
    expect(search('777')).toEqual([]);
    // The raw ISO-style date ('2026-03-…') is never shown — only the
    // ja-JP formatted date is, so hyphenated fragments must not match.
    expect(search('2026-03')).toEqual([]);
  });
});
