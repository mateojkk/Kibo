CREATE TABLE private_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_address text NOT NULL,
    sender_address text NOT NULL,
    encrypted_payload text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Turn on Realtime so the frontend can listen for silent unshielding payloads!
alter publication supabase_realtime add table private_transfers;
