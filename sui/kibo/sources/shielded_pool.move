module kibo::shielded_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::ed25519;

    /// Error codes
    const EAlreadyUsed: u64 = 1;
    const EInvalidSignature: u64 = 2;
    const EInsufficientBalance: u64 = 3;
    const EInvalidAmount: u64 = 4;

    public struct ShieldedPool<phantom T> has key {
        id: UID,
        balance: Balance<T>,
        used_commitments: vector<vector<u8>>,
    }

    public struct DepositEvent has copy, drop {
        commitment: vector<u8>,
        encrypted_metadata: vector<u8>,
        amount: u64,
    }

    public struct WithdrawalEvent has copy, drop {
        commitment: vector<u8>,
        recipient: address,
        amount: u64,
    }

    /// Create and share a new shielded pool for coin type `T`.
    public fun create_pool<T>(ctx: &mut TxContext) {
        let pool = ShieldedPool<T> {
            id: object::new(ctx),
            balance: balance::zero(),
            used_commitments: vector[],
        };
        transfer::share_object(pool);
    }

    /// Deposit coins into the shielded pool with a commitment and encrypted metadata.
    public fun deposit<T>(
        pool: &mut ShieldedPool<T>,
        coins: Coin<T>,
        commitment: vector<u8>,
        encrypted_metadata: vector<u8>,
        _ctx: &mut TxContext
    ) {
        let amount = coin::value(&coins);
        assert!(amount > 0, EInvalidAmount);
        
        let coin_balance = coin::into_balance(coins);
        balance::join(&mut pool.balance, coin_balance);

        event::emit(DepositEvent {
            commitment,
            encrypted_metadata,
            amount,
        });
    }

    /// Withdraw/claim coins from the shielded pool by providing a valid Ed25519 signature over
    /// the commitment and destination address, matching the recipient public key.
    public fun withdraw<T>(
        pool: &mut ShieldedPool<T>,
        commitment: vector<u8>,
        recipient_pubkey: vector<u8>,
        signature: vector<u8>,
        dest_address: address,
        amount: u64,
        ctx: &mut TxContext
    ) {
        // Ensure commitment is not already spent
        assert!(!vector::contains(&pool.used_commitments, &commitment), EAlreadyUsed);
        
        // Ensure the pool has enough balance
        assert!(balance::value(&pool.balance) >= amount, EInsufficientBalance);

        // Verify Ed25519 signature over (commitment + dest_address)
        // Message payload = commitment bytes + destination address bytes
        let mut msg = vector[];
        vector::append(&mut msg, commitment);
        let dest_bytes = sui::address::to_bytes(dest_address);
        vector::append(&mut msg, dest_bytes);

        // Verify the signature on-chain using Sui's native Ed25519 library
        assert!(ed25519::ed25519_verify(&signature, &recipient_pubkey, &msg), EInvalidSignature);

        // Mark commitment as spent
        vector::push_back(&mut pool.used_commitments, commitment);

        // Split balance and transfer to destination address
        let withdraw_balance = balance::split(&mut pool.balance, amount);
        let withdraw_coin = coin::from_balance(withdraw_balance, ctx);
        transfer::public_transfer(withdraw_coin, dest_address);

        event::emit(WithdrawalEvent {
            commitment,
            recipient: dest_address,
            amount,
        });
    }
}
