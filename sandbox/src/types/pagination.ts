export type Pagination = {
  page?: number;
  limit?: number;
};

export type TeamScopedPagination = Pagination & {
  teamId?: string;
};

export type Paginated<T> = {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  limit: number;
};
