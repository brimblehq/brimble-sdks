import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT } from '../constants';
import type { Pagination } from '../types';

/** Convert pagination inputs into query params with sensible defaults. */
export function toPaginationQuery(pagination: Pagination = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(pagination.page ?? DEFAULT_PAGE));
  params.set('limit', String(pagination.limit ?? DEFAULT_PAGE_LIMIT));
  return params;
}
