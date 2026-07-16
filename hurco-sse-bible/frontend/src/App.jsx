import { useEffect, useState } from 'react';
import { api } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import SearchBar from './components/SearchBar.jsx';
import SearchResults from './components/SearchResults.jsx';
import DocumentDetail from './components/DocumentDetail.jsx';
import TicketDetail from './components/TicketDetail.jsx';
import TicketForm from './components/TicketForm.jsx';
import CategoryBrowse from './components/CategoryBrowse.jsx';
import AddDocumentModal from './components/AddDocumentModal.jsx';
import AddCategoryModal from './components/AddCategoryModal.jsx';

export default function App() {
  const [categories, setCategories] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [view, setView] = useState({ type: 'welcome' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [localResults, setLocalResults] = useState(null);

  const refreshCategories = () => api.getCategories().then(setCategories);
  const refreshDocuments = () => api.getDocuments().then(setDocuments);

  useEffect(() => {
    refreshCategories();
    refreshDocuments();
  }, []);

  const handleSearch = async (query) => {
    const local = await api.searchLocal(query);
    setLocalResults(local);
    setView({ type: 'search', query });
  };

  const openDocument = (id) => setView({ type: 'document', id });
  const openTicket = (id) => setView({ type: 'ticket', id });
  const openCategory = (id) => setView({ type: 'category', id });
  const openNewTicket = () => setView({ type: 'ticketForm', id: null });
  const openEditTicket = (id) => setView({ type: 'ticketForm', id });

  const onDocumentUploaded = (doc) => {
    setShowAddModal(false);
    refreshCategories();
    refreshDocuments();
    openDocument(doc.id);
  };

  const onTicketSaved = (id) => {
    refreshCategories();
    openTicket(id);
  };

  const onCategoryCreated = (category) => {
    setShowAddCategoryModal(false);
    refreshCategories();
    openCategory(category.id);
  };

  return (
    <div className="app-shell">
      <Sidebar
        categories={categories}
        selectedCategoryId={view.type === 'category' ? view.id : null}
        onSelectCategory={openCategory}
        onAddDocument={() => setShowAddModal(true)}
        onAddTicket={openNewTicket}
        onAddCategory={() => setShowAddCategoryModal(true)}
      />

      <div className="main-column">
        <header className="top-bar">
          <SearchBar onSearch={handleSearch} />
        </header>

        <main className="main-pane">
          {view.type === 'welcome' && (
            <div className="detail-pane">
              <h2>Welcome to your Hurco SSE Bible</h2>
              <p className="muted">
                Browse a category on the left, search above, or add your first document or ticket.
              </p>
            </div>
          )}

          {view.type === 'search' && (
            <SearchResults
              query={view.query}
              local={localResults}
              onOpenDocument={openDocument}
              onOpenTicket={openTicket}
            />
          )}

          {view.type === 'category' && (
            <CategoryBrowse
              categoryId={view.id}
              categories={categories}
              onOpenDocument={openDocument}
              onOpenTicket={openTicket}
            />
          )}

          {view.type === 'document' && (
            <DocumentDetail
              documentId={view.id}
              categories={categories}
              onOpenTicket={openTicket}
              onChanged={refreshCategories}
            />
          )}

          {view.type === 'ticket' && (
            <TicketDetail
              ticketId={view.id}
              onOpenDocument={openDocument}
              onEdit={openEditTicket}
            />
          )}

          {view.type === 'ticketForm' && (
            <TicketForm
              ticketId={view.id}
              documents={documents}
              onSaved={onTicketSaved}
              onCancel={() => (view.id ? openTicket(view.id) : setView({ type: 'welcome' }))}
            />
          )}
        </main>
      </div>

      {showAddModal && (
        <AddDocumentModal
          categories={categories}
          documents={documents}
          onClose={() => setShowAddModal(false)}
          onUploaded={onDocumentUploaded}
        />
      )}

      {showAddCategoryModal && (
        <AddCategoryModal
          categories={categories}
          onClose={() => setShowAddCategoryModal(false)}
          onCreated={onCategoryCreated}
        />
      )}
    </div>
  );
}
