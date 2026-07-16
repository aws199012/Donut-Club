export default function Sidebar({ categories, selectedCategoryId, onSelectCategory, onAddDocument, onAddTicket, onAddCategory }) {
  const topLevel = categories.filter((c) => !c.parent_id);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id);

  // Single shared render path for every category — top-level, nested, seeded, or
  // freshly created via "+ new" — so the pixel-button styling and animations apply
  // uniformly with no separate markup to keep in sync.
  const renderNode = (cat, isNested = false) => {
    const children = childrenOf(cat.id);
    return (
      <li key={cat.id}>
        <button
          className={`category-pixel-button${isNested ? ' category-pixel-button--nested' : ''}${selectedCategoryId === cat.id ? ' active' : ''}`}
          onClick={() => onSelectCategory(cat.id)}
        >
          <span className="category-pixel-button-label">{cat.name}</span>
          <span className="category-pixel-button-count">{cat.document_count}</span>
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
