export default function Sidebar({ categories, selectedCategoryId, onSelectCategory, onAddDocument, onAddTicket, onAddCategory }) {
  const topLevel = categories.filter((c) => !c.parent_id);
  const childrenOf = (id) => categories.filter((c) => c.parent_id === id);

  const renderNode = (cat) => {
    const children = childrenOf(cat.id);
    return (
      <li key={cat.id}>
        <button
          className={`sidebar-item${selectedCategoryId === cat.id ? ' active' : ''}`}
          onClick={() => onSelectCategory(cat.id)}
        >
          <span>{cat.name}</span>
          <span className="count">{cat.document_count}</span>
        </button>
        {children.length > 0 && (
          <ul className="sidebar-children">{children.map(renderNode)}</ul>
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
        <ul className="sidebar-tree">{topLevel.map(renderNode)}</ul>
      </nav>
    </aside>
  );
}
