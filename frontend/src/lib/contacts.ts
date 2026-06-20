// contacts.ts - address book stored on backend only
import { baseApi } from '../api';

export interface Contact {
  id: string;
  name: string;
  address: string;
}

export async function getContacts(): Promise<Contact[]> {
  const resp = await baseApi.get('/contacts');
  return (resp.data || []).map((c: any) => ({
    id: c.id,
    name: c.name.toLowerCase(),
    address: c.walletAddress || c.address,
  }));
}

export async function addContact(
  name: string,
  address: string,
  _walletAddress?: string
): Promise<Contact> {
  const contact: Contact = {
    id: crypto.randomUUID(),
    name: name.toLowerCase(),
    address,
  };

  const resp = await baseApi.post('/contacts', {
    name: contact.name,
    walletAddress: address,
  });
  contact.id = resp.data?.id || contact.id;
  return contact;
}

export async function removeContact(
  name: string,
  _walletAddress?: string
): Promise<boolean> {
  const contacts = await getContacts();
  const contact = contacts.find((c) => c.name === name.toLowerCase());
  if (!contact?.id) return false;
  await baseApi.delete(`/contacts/${contact.id}`);
  return true;
}

export function findContact(
  nameOrAddress: string,
  contacts: Contact[]
): Contact | undefined {
  const trimmed = nameOrAddress.trim();
  const cleaned = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  const q = cleaned.toLowerCase();
  return (
    contacts.find((c) => c.name === q) ||
    contacts.find((c) => c.address.toLowerCase() === q)
  );
}
