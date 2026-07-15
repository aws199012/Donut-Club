const BASE = '/api';

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getCategories: () => request('/categories'),
  createCategory: (name, parent_id) =>
    request('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id }),
    }),
  getCategoryItems: (id) => request(`/categories/${id}/items`),

  getDocuments: () => request('/documents'),
  getDocument: (id) => request(`/documents/${id}`),
  uploadDocument: (formData) => request('/documents', { method: 'POST', body: formData }),
  updateDocument: (id, patch) =>
    request(`/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),

  getTickets: () => request('/tickets'),
  getTicket: (id) => request(`/tickets/${id}`),
  createTicket: (ticket) =>
    request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket),
    }),
  updateTicket: (id, patch) =>
    request(`/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteTicket: (id) => request(`/tickets/${id}`, { method: 'DELETE' }),

  searchLocal: (q) => request(`/search/local?q=${encodeURIComponent(q)}`),
  searchWeb: (q) => request(`/search/web?q=${encodeURIComponent(q)}`),
};
