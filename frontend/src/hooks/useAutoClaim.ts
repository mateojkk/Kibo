import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { baseApi } from '../api';
import type { AgentWallet } from '../lib/wallet';
import { claimPrivatePayment } from '../lib/wallet';
import { decryptMetadata } from '../lib/crypto';

export function useAutoClaim(wallet: AgentWallet | null, refreshBalance: () => void) {
  useEffect(() => {
    if (!wallet || !wallet.encryptionPrivateKey) return;

    let timeoutId: number;
    let isProcessing = false;

    const pollPendingTransfers = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        const resp = await baseApi.get('/private_transfers/pending');
        const transfers = resp.data || [];

        for (const transfer of transfers) {
          try {
            // 1. Decrypt payload
            const encryptedPayloadStr = transfer.encrypted_payload;
            let encryptedPayload;
            try {
              encryptedPayload = JSON.parse(encryptedPayloadStr);
            } catch (e) {
              encryptedPayload = encryptedPayloadStr;
            }

            const privKey = wallet.encryptionPrivateKey;
            if (!privKey) throw new Error('Missing encryption key');
            const metadata = await decryptMetadata(privKey, encryptedPayload);
            if (!metadata.amount || !metadata.salt) {
              throw new Error('Invalid payload metadata');
            }

            const tokenSymbol = metadata.tokenSymbol || 'USDC';
            const decimals = tokenSymbol.toLowerCase() === 'sui' ? 9 : 6;
            const floatAmount = Number(metadata.amount) / Math.pow(10, decimals);

            // 2. Claim funds silently
            toast.loading(`Unshielding private payment...`, { id: transfer.id });
            await claimPrivatePayment(wallet, floatAmount, metadata.salt, tokenSymbol);

            // 3. Mark as claimed in backend
            await baseApi.post(`/private_transfers/${transfer.id}/claim`);

            toast.success(`Received private payment of ${floatAmount} ${tokenSymbol}!`, { id: transfer.id });
            refreshBalance();
          } catch (err: any) {
            console.error('Auto-claim failed for transfer', transfer.id, err);
            toast.error(`Failed to claim private payment.`, { id: transfer.id });
          }
        }
      } catch (err) {
        console.error('Failed to poll private transfers', err);
      } finally {
        isProcessing = false;
        timeoutId = window.setTimeout(pollPendingTransfers, 5000);
      }
    };

    pollPendingTransfers();

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [wallet, refreshBalance]);
}
