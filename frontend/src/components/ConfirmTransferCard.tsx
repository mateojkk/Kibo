

interface Props {
  amount: number;
  tokenSymbol: string;
  to: string;
  isPrivate: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}

export default function ConfirmTransferCard({ amount, tokenSymbol, to, isPrivate, onConfirm, onCancel, busy }: Props) {
  return (
    <div style={{
      background: '#0b0a0a',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '16px',
      margin: '12px 0',
      fontFamily: 'var(--font-ui)',
      color: 'var(--fg)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      width: '100%',
      maxWidth: '360px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: 'var(--fg)' }}>
          Staging Transfer
        </h3>
        <span style={{ fontSize: '10px', background: 'var(--overlay-hl)', padding: '4px 8px', borderRadius: '4px', color: 'var(--fg-dim)' }}>
          Network Fee: Sponsored
        </span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg)', padding: '12px', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--fg-muted)' }}>Amount</span>
          <span style={{ fontWeight: 600 }}>{amount} {tokenSymbol}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--fg-muted)' }}>To</span>
          <span style={{ fontWeight: 600 }}>{to}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--fg-muted)' }}>Visibility</span>
          <span style={{ fontWeight: 600, color: isPrivate ? '#a78bfa' : 'var(--fg)' }}>{isPrivate ? 'Private' : 'Public'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button 
          onClick={onCancel}
          disabled={busy}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            padding: '10px',
            borderRadius: '8px',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500
          }}
        >
          Cancel
        </button>
        <button 
          onClick={onConfirm}
          disabled={busy}
          style={{
            flex: 1,
            background: 'var(--fg)',
            border: '1px solid var(--fg)',
            color: 'var(--bg)',
            padding: '10px',
            borderRadius: '8px',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 600
          }}
        >
          {busy ? 'Processing...' : 'Confirm & Send'}
        </button>
      </div>
    </div>
  );
}
