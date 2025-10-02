// src/features/store/StorePanel.tsx
import React from "react";
import { useInventory, StoreItem } from "../../state/inventory";
import { useWallet, COIN_SKUS, type CoinSkuId } from "../../state/wallet";

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
  const grantSku = useWallet((s) => s.grantSku);

  // In production: call your server to create a Stripe Checkout session, then redirect.
  // For dev/MVP we immediately grant coins after a confirm() to mimic success.
  async function startCheckoutMock(sku: CoinSkuId) {
    const def = COIN_SKUS[sku];
    const ok = window.confirm(
      `Dev purchase:\n\n${def.label} for $${def.priceUsd.toFixed(2)}\n\nAdd coins now?`
    );
    if (ok) {
      grantSku(sku);
      alert(`✅ Added ${def.coins.toLocaleString()} coins.`);
    }
  }

  return (
    <div className="buyc">
      <div className="buyc-head">
        <h4 style={{ margin: 0 }}>Buy Coins</h4>
        <p className="muted small" style={{ margin: 0 }}>
          Use coins to buy cosmetics and building materials.
        </p>
      </div>

      <div className="buyc-grid">
        {(Object.keys(COIN_SKUS) as CoinSkuId[]).map((id) => {
          const def = COIN_SKUS[id];
          return (
            <div className="sku" key={id}>
              <div className="sku-top">
                <div className="sku-emoji">🪙</div>
                <div className="sku-meta">
                  <div className="sku-name">{def.label}</div>
                  <div className="sku-sub">${def.priceUsd.toFixed(2)}</div>
                </div>
              </div>
              <button className="primary w100" onClick={() => startCheckoutMock(id)}>
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

  async function onBuy() {
    const res = buy(item.id);
    if (!res.ok) {
      // If wallet is the blocker, nudge to top-up
      if (!canAfford) {
        const goTopUp = window.confirm(
          `You need ${item.price.toLocaleString()} coins but only have ${wallet.format()}.\n\nBuy more coins now?`
        );
        if (goTopUp) {
          // Smooth scroll to Buy Coins section
          const node = document.getElementById("buy-coins");
          if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else {
        alert(res.reason ?? "Could not buy.");
      }
      return;
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
          <button className="primary" onClick={onBuy} disabled={!canAfford}>
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
      <div id="buy-coins">
        <BuyCoins />
      </div>

      <p className="muted small" style={{ marginTop: 6 }}>Cosmetics only • Coins only</p>

      <div className="grid">
        {catalog.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
      </div>

      <style>{`
        .store{ display:flex; flex-direction:column; gap:12px; }
        .grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px; }
        .muted{ color:#9fb0c7; }
        .small{ font-size:12px; }
        .primary{
          background:#2563eb; border:none; color:white; padding:10px 12px;
          border-radius:10px; cursor:pointer;
        }
        .w100{ width:100%; }
      `}</style>
    </div>
  );
}
