// Fixed rotation (not random) so a category's color stays the same across reloads,
// as long as the category list order itself is stable (it is — the API returns
// categories sorted by name).
const BUTTON_COLORS = ['red', 'blue', 'green'];

export default function Sidebar({ categories, selectedCategoryId, onSelectCategory, onAddDocument, onAddTicket, onAddCategory }) {
  const topLevel = categories.filter((c) => !c.parent_id);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id);

  let colorIndex = 0;

  // Single shared render path for every category — top-level, nested, seeded, or
  // freshly created via "+ new" — so the pixel-button styling and animations apply
  // uniformly with no separate markup to keep in sync.
  const renderNode = (cat, isNested = false) => {
    const children = childrenOf(cat.id);
    const color = BUTTON_COLORS[colorIndex++ % BUTTON_COLORS.length];
    const count = cat.document_count;
    return (
      <li key={cat.id}>
        <button
          className={`category-pixel-button category-pixel-button--${color}${isNested ? ' category-pixel-button--nested' : ''}${selectedCategoryId === cat.id ? ' active' : ''}`}
          onClick={() => onSelectCategory(cat.id)}
        >
          <span className="category-pixel-button-label">{cat.name}</span>
          <span className="category-pixel-button-count">{count} item{count === 1 ? '' : 's'}</span>
        </button>
        {children.length > 0 && (
          <ul className="sidebar-children">{children.map((child) => renderNode(child, true))}</ul>
        )}
      </li>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">Hurco SSE Bible</div>
      <div className="sidebar-actions">
        <button className="btn btn-primary" onClick={onAddDocument}>+ Add Document</button>
        <button className="btn" onClick={onAddTicket}>+ New Ticket</button>
      </div>
      <nav>
        <div className="sidebar-section-label">
          Categories
          <button className="link-btn sidebar-add-category" onClick={onAddCategory}>+ new</button>
        </div>
        <ul className="sidebar-tree">{topLevel.map((cat) => renderNode(cat))}</ul>
      </nav>
    </aside>
  );
}
