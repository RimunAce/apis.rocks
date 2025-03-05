export const getPagination = (page: number = 1, limit: number = 10) => {
  const from = (page - 1) * limit;
  const to = page * limit - 1;
  return { from, to };
};
