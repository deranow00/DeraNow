export default function Pagination({ meta, onPageChange }) {
  if (!meta || (meta.totalPages || 1) <= 1) return null;

  return (
    <div className="pagination">
      <button className="btn secondary" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
        Prev
      </button>
      <span>Page {meta.page} of {meta.totalPages} ({meta.total} total)</span>
      <button className="btn secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
        Next
      </button>
    </div>
  );
}
