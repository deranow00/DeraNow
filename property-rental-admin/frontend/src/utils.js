export const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

export const statusClass = (value) => String(value || '').toLowerCase();

export const parsePaged = (payload) => {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      meta: { total: payload.length, page: 1, limit: payload.length || 1, totalPages: 1 },
    };
  }
  return {
    items: payload?.items || [],
    meta: payload?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 },
  };
};
