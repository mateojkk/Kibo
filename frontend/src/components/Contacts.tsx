import { useState, useEffect, type FormEvent } from 'react';
import { User, Plus, Trash2, Send, Search, Mail, Phone } from 'lucide-react';

import { toast } from 'react-hot-toast';
import { isValidAddress, baseApi, getErrorMessage, getAuthToken } from '../api';
import styles from '../styles/contactsLegacy.module.css';

interface Contact {
  id: string;
  name: string;
  address: string;
  email?: string;
  phone?: string;
}

export default function Contacts({ onSelect }: { onSelect?: (contact: Contact) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean>(() => Boolean(getAuthToken()));

  const fetchContacts = async () => {
    try {
      const resp = await baseApi.get('/contacts');
      setContacts(resp.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setIsAuthed(Boolean(getAuthToken()));
    if (getAuthToken()) fetchContacts();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName || !newAddress) return;
    if (!isValidAddress(newAddress)) {
      toast.error('Invalid wallet address format');
      return;
    }
    try {
      await baseApi.post('/contacts', {
        name: newName,
        walletAddress: newAddress,
        email: newEmail,
        phone: newPhone,
      });
      await fetchContacts();
      setNewName('');
      setNewAddress('');
      setNewEmail('');
      setNewPhone('');
      setShowAdd(false);
      toast.success('Contact saved!');
    } catch (err) {
      console.error(err);
      toast.error(`Failed to save contact: ${getErrorMessage(err)}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await baseApi.delete(`/contacts/${id}`);
      await fetchContacts();
      toast.success('Contact removed');
    } catch (err) {
      console.error(err);
      toast.error(`Failed to delete contact: ${getErrorMessage(err)}`);
    }
  };

  const filtered = contacts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.address.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  if (!isAuthed) {
    return (
      <div className={styles['animate-fade-in']} style={{ width: '100%', maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--fg-secondary)' }}>Sign in to view contacts.</p>
      </div>
    );
  }

  return (
    <div className={styles['animate-fade-in']} style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <User size={24} /> Address Book
        </h2>
        <button className={styles['primary-button']} onClick={() => setShowAdd(!showAdd)}>
          <Plus size={20} /> {showAdd ? 'Cancel' : 'Add Contact'}
        </button>
      </div>

      {showAdd && (
        <div className={styles['glass-card']} style={{ marginBottom: '2rem' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className={styles['input-group']}>
              <label>Name</label>
              <input 
                type="text" 
                placeholder="e.g. Alice Sui" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                required 
              />
            </div>
            <div className={styles['input-group']}>
              <label>Email (optional)</label>
              <input 
                type="email" 
                placeholder="alice@example.com" 
                value={newEmail} 
                onChange={e => setNewEmail(e.target.value)} 
              />
            </div>
            <div className={styles['input-group']}>
              <label>Phone (optional)</label>
              <input 
                type="tel" 
                placeholder="+1 555-123-4567" 
                value={newPhone} 
                onChange={e => setNewPhone(e.target.value)} 
              />
            </div>
            <div className={styles['input-group']}>
              <label>Wallet Address</label>
              <input 
                type="text" 
                placeholder="0x..." 
                value={newAddress} 
                onChange={e => setNewAddress(e.target.value)} 
                required 
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <button type="submit" className={styles['primary-button']} style={{ justifyContent: 'center' }}>
              Save Contact
            </button>
          </form>
        </div>
      )}

      <div className={styles['glass-card']} style={{ padding: '0' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Search size={18} color="var(--fg-secondary)" />
          <input 
            type="text" 
            placeholder="Search by name, email or address..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', padding: '0.5rem', fontSize: '0.9rem', background: 'transparent', color: 'var(--fg)', width: '100%' }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--fg-secondary)' }}>
            {contacts.length === 0 ? 'Your address book is empty.' : 'No contacts match your search.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((contact, index) => (
              <div 
                key={contact.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '1.25rem 1.5rem',
                  borderBottom: index === filtered.length - 1 ? 'none' : '1px solid var(--border)',
                  transition: 'background 0.2s ease',
                  cursor: onSelect ? 'pointer' : 'default'
                }}
                className={styles['contact-item']}
                onClick={() => onSelect?.(contact)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ background: 'var(--fg)', color: 'var(--bg)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {contact.name[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 style={{ fontWeight: '600' }}>{contact.name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', fontFamily: 'monospace' }}>
                        {contact.address.slice(0, 6)}...{contact.address.slice(-4)}
                      </p>
                      {contact.email && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Mail size={12} /> {contact.email.toLowerCase()}
                        </p>
                      )}
                      {contact.phone && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Phone size={12} /> {contact.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {onSelect && (
                    <button
                      className={styles['secondary-button']}
                      style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      onClick={(e) => { e.stopPropagation(); onSelect(contact); }}
                    >
                      <Send size={14} /> Pay
                    </button>
                  )}
                  <button 
                    style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer', padding: '0.5rem' }}
                    onClick={(e) => { e.stopPropagation(); handleDelete(contact.id); }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
