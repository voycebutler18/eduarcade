// src/features/store/StorePanel.tsx
import { useInventory, StoreItem } from "../../state/inventory";
import { useWallet, COIN_SKUS, type CoinSkuId } from "../../state/wallet";

const API_BASE = import.meta.env.VITE_API_BASE_URL; // e.g., https://your-api.onrender.com
const COIN_PACKS: CoinSkuId[] = ["COINS_1K", "COINS_5K", "COINS_12K"];

function BalanceBar() {
  const coins = useWallet((s) => s.coins);
  const format = useWallet((s) => s.format);
  return (
    <div className="bal">
      <span className="bal-left">Balance</span>
      <span className="bal-right">{format(coins)}c</span>
      <style>{`
        .bal{
          display:flex; align-items:center; justify-content:space-between;
          background:#0b1222; border:1px solid rgba(255,255,255,.08);
          color:#e6edf7; border-radius:12px; padding:10px 12px;
        }
        .bal-left{ font-size:13px; color:#9fb0c7; }
        .bal-right{ font-weight:800; color:#ffd47a; letter-spacing:.3px; }
      `}</style>
    </div>
  );
}

function BuyCoins() {
  async function startCheckout(sku: CoinSkuId) {
    try {
      if (!API_BASE) throw new Error("VITE_API_BASE_URL not set");
      const resp = await fetch(`${API_BASE}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // TODO: replace "anon" with your real logged-in user id when auth is wired
        body: JSON.stringify({ sku, userId: "anon" }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Checkout failed");
      if (!data?.url) throw new Error("No checkout URL returned");
      window.location.href = data.url; // Stripe Checkout
    } catch (e: any) {
      alert(e?.message || "Checkout failed");
    }
  }

  return (
    <div className="buyc" id="buy-coins">
      <div className="buyc-head">
        <h4 style={{ margin: 0 }}>Buy Coins</h4>
        <p className="muted small" style={{ margin: 0 }}>
          Use coins to buy cosmetics and building materials.
        </p>
      </div>

      <div className="buyc-grid">
        {COIN_PACKS.map((id) => {
          const def = COIN_SKUS[id];
          return (
            <div className="sku" key={id}>
              <div className="sku-top">
                <div className="sku-emoji">🪙</div>
                <div className="sku-meta">
                  <div className="sku-name">{def.label}</div>
                  <div className="sku-sub">${def.priceUsd.toFixed(2)} USD</div>
                </div>
              </div>
              <button className="primary w100" onClick={() => startCheckout(id)}>
                Get Coins
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        .buyc{ display:grid; gap:10px; }
        .buyc-grid{
          display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px;
        }
        .sku{
          background:#0b1222; border:1px solid rgba(255,255,255,.08);
          border-radius:12px; padding:10px; display:grid; gap:10px;
        }
        .sku-top{ display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:center; }
        .sku-emoji{ font-size:22px; }
        .sku-name{ font-weight:700; color:#e6edf7; }
        .sku-sub{ font-size:12px; color:#9fb0c7; }
        .primary{
          background:#2563eb; border:none; color:white; padding:10px 12px;
          border-radius:10px; cursor:pointer;
        }
        .w100{ width:100%; }
        .muted{ color:#9fb0c7; }
        .small{ font-size:12px; }
      `}</style>
    </div>
  );
}

function ItemCard({ item }: { item: StoreItem }) {
  const { buy, isOwned, equip, equipped } = useInventory((s) => ({
    buy: s.buy,
    isOwned: s.isOwned,
    equip: s.equip,
    equipped: s.equipped,
  }));
  const wallet = useWallet();

  const owned = isOwned(item.id);
  const isEquipped = equipped[item.slot] === item.id;
  const canAfford = wallet.canAfford(item.price);

  function scrollToBuyCoins() {
    const node = document.getElementById("buy-coins");
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onBuy() {
    const res = buy(item.id);
    if (!res.ok) {
      if (!canAfford) {
        const goTopUp = window.confirm(
          `You need ${item.price.toLocaleString()} coins but only have ${wallet.format()}.\n\nBuy more coins now?`
        );
        if (goTopUp) scrollToBuyCoins();
      } else {
        alert(res.reason ?? "Could not buy.");
      }
    }
  }

  function onEquip() {
    equip(item.id);
  }

  return (
    <div className="card">
      <div className="row1">
        <div className="emoji">{item.emoji ?? "🧩"}</div>
        <div className="meta">
          <div className="name">{item.name}</div>
          <div className="sub">
            <span>{item.slot}</span> • <span>{item.rarity}</span>
          </div>
        </div>
        <div className="price">{item.price.toLocaleString()}c</div>
      </div>

      <div className="row2">
        {!owned ? (
          <button
            className="primary"
            onClick={onBuy}
            // NOTE: don't disable; we want to catch click and guide to Buy Coins
            style={!canAfford ? { opacity: 0.8 } : undefined}
          >
            {canAfford ? "Buy" : "Need Coins"}
          </button>
        ) : isEquipped ? (
          <button className="ghost" disabled>Equipped</button>
        ) : (
          <button className="ghost" onClick={onEquip}>Equip</button>
        )}
      </div>

      <style>{`
        .card{
          background:#111a2d; border:1px solid rgba(255,255,255,.08);
          border-radius:12px; padding:10px;
          display:flex; flex-direction:column; gap:10px;
        }
        .row1{ display:grid; grid-template-columns:auto 1fr auto; gap:10px; align-items:center; }
        .emoji{ font-size:24px; }
        .meta .name{ font-weight:700; color:#e6edf7; }
        .sub{ font-size:12px; color:#9fb0c7; }
        .price{ color:#ffd47a; font-weight:800; }
        .row2{ display:flex; justify-content:flex-end; }
        .ghost{
          background:transparent; border:1px solid rgba(255,255,255,.12);
          color:#e6edf7; border-radius:10px; padding:8px 12px; cursor:pointer;
        }
      `}</style>
    </div>
  );
}

export default function StorePanel() {
  const { catalog } = useInventory((s) => ({ catalog: s.catalog }));

  return (
    <div className="store">
      <h3>Store</h3>
      <BalanceBar />
      <BuyCoins />

      <p className="muted small" style={{ marginTop: 6 }}>Cosmetics only • Coins only</p>

      <div className="grid">
        {catalog.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>

      <style>{`
        .store{ display:flex; flex-direction:column; gap:12px; }
        .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
      `}</style>
    </div>
  );
}
